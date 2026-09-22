import type {
  AddressConfig,
  AddressResolution,
  Outage,
  OutageSchedule,
  TauronCity,
  TauronOutageItem,
  TauronOutageResponse,
  TauronStreet,
} from "./types";

const API_BASE_URL = "https://www.tauron-dystrybucja.pl";
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("pl-PL");
}

function formatApiTimestamp(value: Date): string {
  return value.toISOString().slice(0, 19);
}

async function fetchJson<T>(
  endpoint: string,
  params: URLSearchParams,
): Promise<T> {
  const url = new URL(endpoint, API_BASE_URL);
  url.search = params.toString();

  const response = await fetch(url, {
    headers: { Accept: "application/json, text/plain;q=0.9" },
  });
  if (!response.ok) {
    throw new Error(`Tauron ${endpoint} returned HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(`Tauron ${endpoint} returned invalid JSON`, {
      cause: error,
    });
  }
}

function selectUnique<T>(
  values: T[],
  predicate: (value: T) => boolean,
  description: string,
): T {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(
      `Expected one Tauron ${description} match, received ${matches.length}`,
    );
  }
  return matches[0]!;
}

export async function resolveAddress(
  config: AddressConfig,
): Promise<AddressResolution> {
  const cities = await fetchJson<TauronCity[]>(
    "/waapi/enum/geo/cities",
    new URLSearchParams({ partName: config.city }),
  );
  if (!Array.isArray(cities)) {
    throw new Error("Tauron city response is not an array");
  }

  const normalizedCity = normalizeName(config.city);
  const city = selectUnique(
    cities,
    (candidate) => normalizeName(candidate.Name) === normalizedCity,
    `city for ${config.city}`,
  );

  const streets = await fetchJson<TauronStreet[]>(
    "/waapi/enum/geo/streets",
    new URLSearchParams({
      ownerGAID: city.GAID.toString(),
      partName: config.street,
    }),
  );
  if (!Array.isArray(streets)) {
    throw new Error("Tauron street response is not an array");
  }

  const normalizedStreet = normalizeName(config.street);
  const street = selectUnique(
    streets,
    (candidate) =>
      [candidate.Name, candidate.ShortName, candidate.FullName].some(
        (name) => normalizeName(name) === normalizedStreet,
      ),
    `street for ${config.street}`,
  );

  return {
    cityGaid: city.GAID,
    cityName: city.Name,
    streetGaid: street.GAID,
    streetName: street.Name,
  };
}

function startsWithPlaceName(message: string, prefix: string): boolean {
  const normalizedMessage = normalizeName(message);
  const normalizedPrefix = normalizeName(prefix);
  if (!normalizedMessage.startsWith(normalizedPrefix)) {
    return false;
  }

  const nextCharacter = normalizedMessage.at(normalizedPrefix.length);
  return nextCharacter === undefined || /[\s,;:.\-–—]/u.test(nextCharacter);
}

function parseDate(value: string | null, field: string): Date {
  if (!value) {
    throw new Error(`Tauron outage is missing ${field}`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Tauron outage has an invalid ${field}`);
  }
  return date;
}

function parseOutage(item: TauronOutageItem): Outage | null {
  if (!item.IsActive) {
    return null;
  }
  if (!item.OutageId || typeof item.OutageId !== "string") {
    throw new Error("Tauron outage is missing OutageId");
  }
  if (!item.Message || typeof item.Message !== "string") {
    throw new Error("Tauron outage is missing Message");
  }
  if (typeof item.TypeId !== "number") {
    throw new Error("Tauron outage is missing TypeId");
  }

  const start = parseDate(item.StartDate, "StartDate");
  const end = parseDate(item.EndDate, "EndDate");
  if (end <= start) {
    throw new Error("Tauron outage EndDate must be after StartDate");
  }

  return {
    end,
    id: item.OutageId,
    message: item.Message,
    modified: item.Modified ? parseDate(item.Modified, "Modified") : null,
    start,
    typeId: item.TypeId,
  };
}

export async function fetchOutageSchedule(
  config: AddressConfig,
  now: Date,
  cachedResolution?: AddressResolution,
): Promise<OutageSchedule> {
  const resolution = cachedResolution ?? (await resolveAddress(config));
  const response = await fetchJson<TauronOutageResponse>(
    "/waapi/outages/address",
    new URLSearchParams({
      cityGAID: resolution.cityGaid.toString(),
      streetGAID: resolution.streetGaid.toString(),
      houseNo: config.houseNumber,
      fromDate: formatApiTimestamp(new Date(now.getTime() - 7 * DAY_MS)),
      toDate: formatApiTimestamp(new Date(now.getTime() + 30 * DAY_MS)),
      getLightingSupport: "true",
      getServicedSwitchingoff: "true",
    }),
  );

  if (
    response === null ||
    typeof response !== "object" ||
    !("OutageItems" in response) ||
    (response.OutageItems !== null && !Array.isArray(response.OutageItems))
  ) {
    throw new Error("Tauron outage response has an invalid shape");
  }

  const rawItems = response.OutageItems ?? [];
  const outages = rawItems
    .map(parseOutage)
    .filter((outage): outage is Outage => outage !== null)
    .filter((outage) =>
      startsWithPlaceName(outage.message, config.messagePrefix),
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  return {
    outages,
    rawOutageCount: rawItems.length,
    resolution,
  };
}
