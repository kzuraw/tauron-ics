import { describe, expect, it } from "vitest";

import { generateCalendar } from "../src/calendar";
import type { AddressConfig, Outage } from "../src/types";

const address: AddressConfig = {
  city: "Testowo",
  street: "Testowa",
  houseNumber: "1",
  messagePrefix: "Testowo",
};

const outages: Outage[] = [
  {
    id: "same-id",
    start: new Date("2026-09-21T06:00:00Z"),
    end: new Date("2026-09-21T10:00:00Z"),
    modified: new Date("2026-09-01T11:18:33Z"),
    message: "Testowo ul. Testowa od Pierwszej do Drugiej, dz. 1/2.",
    typeId: 1,
  },
  {
    id: "same-id",
    start: new Date("2026-09-21T12:00:00Z"),
    end: new Date("2026-09-21T14:00:00Z"),
    modified: null,
    message: "Testowo: awaria.",
    typeId: 2,
  },
];

describe("generateCalendar", () => {
  const calendar = generateCalendar(
    outages,
    address,
    new Date("2026-09-17T08:00:00Z"),
  );

  it("creates transparent timed events with occurrence-specific UIDs", () => {
    expect(calendar).toContain("X-WR-CALNAME:Wyłączenia prądu\r\n");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar).toContain("DTSTART:20260921T060000Z\r\n");
    expect(calendar).toContain("DTEND:20260921T100000Z\r\n");
    expect(calendar).toContain("UID:same-id-20260921T060000Z@tauron-ics\r\n");
    expect(calendar).toContain("UID:same-id-20260921T120000Z@tauron-ics\r\n");
    expect(calendar.match(/TRANSP:TRANSPARENT/g)).toHaveLength(2);
    expect(calendar).not.toContain("TRANSP:OPAQUE");
    expect(calendar).toContain("LOCATION:Testowo\r\n");
  });

  it("alerts only for planned outages", () => {
    expect(calendar).toContain("SUMMARY:Planowane wyłączenie prądu\r\n");
    expect(calendar).toContain("SUMMARY:Awaria prądu\r\n");
    expect(calendar.match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(calendar).toContain("TRIGGER:-P1D\r\n");
  });

  it("uses CRLF and folds every physical line to at most 75 UTF-8 octets", () => {
    expect(calendar.replaceAll("\r\n", "")).not.toContain("\n");
    for (const line of calendar.split("\r\n")) {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75);
    }
  });
});
