import type { AddressConfig, Outage } from "./types";

const CALENDAR_NAME = "Wyłączenia prądu";
const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  const lines: string[] = [];
  let current = "";
  let byteLength = 0;
  let limit = 75;

  for (const character of line) {
    const characterBytes = encoder.encode(character).byteLength;
    if (byteLength + characterBytes > limit && current.length > 0) {
      lines.push(current);
      current = character;
      byteLength = characterBytes;
      limit = 74;
      continue;
    }

    current += character;
    byteLength += characterBytes;
  }

  lines.push(current);
  return lines.join("\r\n ");
}

function formatUtcTimestamp(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function getSummary(typeId: number): string {
  if (typeId === 1) {
    return "Planowane wyłączenie prądu";
  }
  if (typeId === 2) {
    return "Awaria prądu";
  }
  return "Wyłączenie prądu";
}

function getUid(outage: Outage): string {
  const safeId = outage.id.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${safeId}-${formatUtcTimestamp(outage.start)}@tauron-ics`;
}

export function generateCalendar(
  outages: Outage[],
  address: AddressConfig,
  generatedAt: Date,
): string {
  const timestamp = formatUtcTimestamp(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tauron-ics//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
    "X-WR-TIMEZONE:Europe/Warsaw",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const outage of outages) {
    const modified = outage.modified ?? generatedAt;
    const summary = getSummary(outage.typeId);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${getUid(outage)}`,
      `DTSTAMP:${timestamp}`,
      `LAST-MODIFIED:${formatUtcTimestamp(modified)}`,
      `DTSTART:${formatUtcTimestamp(outage.start)}`,
      `DTEND:${formatUtcTimestamp(outage.end)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(outage.message)}`,
      `LOCATION:${escapeText(address.city)}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
    );

    if (outage.typeId === 1) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(`${summary} za 24 godziny`)}`,
        "TRIGGER:-P1D",
        "END:VALARM",
      );
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export async function calculateSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
