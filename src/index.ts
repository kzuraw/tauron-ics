import { calculateSha256, generateCalendar } from "./calendar";
import { fetchOutageSchedule } from "./tauron";
import type {
  AddressConfig,
  CachedAddressResolution,
  CalendarMetadata,
} from "./types";

const CALENDAR_KEY = "calendar.ics";
const ADDRESS_RESOLUTION_KEY = "address-resolution.v1";

function requireBinding(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required binding: ${name}`);
  }
  return normalized;
}

function getAddressConfigFromEnv(env: Env): AddressConfig {
  return {
    city: requireBinding(env.TAURON_CITY, "TAURON_CITY"),
    street: requireBinding(env.TAURON_STREET, "TAURON_STREET"),
    houseNumber: requireBinding(env.TAURON_HOUSE_NUMBER, "TAURON_HOUSE_NUMBER"),
    messagePrefix: requireBinding(
      env.TAURON_MESSAGE_PREFIX,
      "TAURON_MESSAGE_PREFIX",
    ),
  };
}

function logError(event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
}

function serializeOutagesForHash(
  outages: Awaited<ReturnType<typeof fetchOutageSchedule>>["outages"],
): string {
  return JSON.stringify(
    outages.map((outage) => ({
      end: outage.end.toISOString(),
      id: outage.id,
      message: outage.message,
      modified: outage.modified?.toISOString() ?? null,
      start: outage.start.toISOString(),
      typeId: outage.typeId,
    })),
  );
}

export async function refreshCalendar(
  env: Env,
  generatedAt = new Date(),
): Promise<CalendarMetadata> {
  const address = getAddressConfigFromEnv(env);
  const addressHash = await calculateSha256(JSON.stringify(address));
  const cachedResolution = await env.CALENDAR_KV.get<CachedAddressResolution>(
    ADDRESS_RESOLUTION_KEY,
    "json",
  );
  const reusableResolution =
    cachedResolution?.addressHash === addressHash
      ? cachedResolution
      : undefined;

  const schedule = await fetchOutageSchedule(
    address,
    generatedAt,
    reusableResolution,
  );
  const nextResolution: CachedAddressResolution = {
    addressHash,
    ...schedule.resolution,
  };
  if (JSON.stringify(cachedResolution) !== JSON.stringify(nextResolution)) {
    await env.CALENDAR_KV.put(
      ADDRESS_RESOLUTION_KEY,
      JSON.stringify(nextResolution),
    );
  }

  const sourceHash = await calculateSha256(
    serializeOutagesForHash(schedule.outages),
  );
  const current = await env.CALENDAR_KV.getWithMetadata<CalendarMetadata>(
    CALENDAR_KEY,
    "text",
  );
  if (
    current.value !== null &&
    current.metadata !== null &&
    current.metadata.sourceHash === sourceHash
  ) {
    console.log(
      JSON.stringify({
        event: "calendar.refresh.unchanged",
        eventCount: current.metadata.eventCount,
        lastModified: current.metadata.lastModified,
        rawOutageCount: schedule.rawOutageCount,
      }),
    );
    return current.metadata;
  }

  const calendar = generateCalendar(schedule.outages, address, generatedAt);
  const calendarHash = await calculateSha256(calendar);
  const metadata: CalendarMetadata = {
    etag: `"${calendarHash}"`,
    eventCount: schedule.outages.length,
    lastModified: generatedAt.toISOString(),
    rawOutageCount: schedule.rawOutageCount,
    sourceHash,
  };
  await env.CALENDAR_KV.put(CALENDAR_KEY, calendar, { metadata });
  console.log(
    JSON.stringify({
      event: "calendar.refresh.success",
      eventCount: metadata.eventCount,
      lastModified: metadata.lastModified,
      rawOutageCount: metadata.rawOutageCount,
    }),
  );
  return metadata;
}

async function getSnapshot(
  env: Env,
): Promise<{ calendar: string; metadata: CalendarMetadata }> {
  let stored = await env.CALENDAR_KV.getWithMetadata<CalendarMetadata>(
    CALENDAR_KEY,
    "text",
  );
  if (stored.value === null || stored.metadata === null) {
    await refreshCalendar(env);
    stored = await env.CALENDAR_KV.getWithMetadata<CalendarMetadata>(
      CALENDAR_KEY,
      "text",
    );
  }
  if (stored.value === null || stored.metadata === null) {
    throw new Error("Calendar snapshot was not stored");
  }
  return { calendar: stored.value, metadata: stored.metadata };
}

function createResponseHeaders(metadata: CalendarMetadata): Headers {
  return new Headers({
    "Cache-Control": "private, max-age=3600, must-revalidate",
    "Content-Disposition": 'inline; filename="tauron.ics"',
    "Content-Type": "text/calendar; charset=utf-8",
    ETag: metadata.etag,
    "Last-Modified": new Date(metadata.lastModified).toUTCString(),
    "X-Calendar-Event-Count": metadata.eventCount.toString(),
    "X-Calendar-Last-Updated": metadata.lastModified,
    "X-Tauron-Raw-Outage-Count": metadata.rawOutageCount.toString(),
  });
}

async function tokensMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index]! ^ expectedBytes[index]!;
  }
  return difference === 0;
}

async function hasValidCalendarPath(url: URL, env: Env): Promise<boolean> {
  const match = /^\/calendar\/([^/]+)\.ics$/u.exec(url.pathname);
  if (!match?.[1]) {
    return false;
  }
  let provided: string;
  try {
    provided = decodeURIComponent(match[1]);
  } catch {
    return false;
  }
  return tokensMatch(
    provided,
    requireBinding(env.CALENDAR_TOKEN, "CALENDAR_TOKEN"),
  );
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!(await hasValidCalendarPath(url, env))) {
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  try {
    const stored = await getSnapshot(env);
    const headers = createResponseHeaders(stored.metadata);
    if (request.headers.get("If-None-Match") === stored.metadata.etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === "HEAD" ? null : stored.calendar, {
      status: 200,
      headers,
    });
  } catch (error) {
    logError("calendar.serve.error", error);
    return new Response("Calendar is temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
  }
}

export default {
  fetch: handleFetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      await refreshCalendar(env);
    } catch (error) {
      logError("calendar.refresh.error", error);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
