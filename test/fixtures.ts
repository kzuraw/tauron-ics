import { vi } from "vitest";

export const citiesResponse = [
  {
    GAID: 119001,
    Name: "Testowo",
  },
];

export const streetsResponse = [
  {
    FullName: "Testowa",
    GAID: 971131,
    Name: "Testowa",
    ShortName: "Testowa",
  },
];

export const outagesResponse = {
  OutageItems: [
    {
      OutageId: "planned-shared-id",
      Modified: "2026-09-01T11:18:33.698Z",
      StartDate: "2026-09-21T06:00:00Z",
      EndDate: "2026-09-21T10:00:00Z",
      Message: "Testowo ul. Testowa od Pierwszej do Drugiej.",
      TypeId: 1,
      IsActive: true,
    },
    {
      OutageId: "planned-shared-id",
      Modified: "2026-09-01T11:18:33.698Z",
      StartDate: "2026-09-21T12:00:00Z",
      EndDate: "2026-09-21T14:00:00Z",
      Message: "Testowo ul. Testowa od Pierwszej do Drugiej.",
      TypeId: 1,
      IsActive: true,
    },
    {
      OutageId: "unplanned-id",
      Modified: "2026-09-17T04:32:00.000Z",
      StartDate: "2026-09-17T04:31:27.000Z",
      EndDate: "2026-09-17T07:00:00Z",
      Message: "  TESTOWO: awaria sieci średniego napięcia.",
      TypeId: 2,
      IsActive: true,
    },
    {
      OutageId: "other-place-id",
      Modified: "2026-09-03T08:00:00.000Z",
      StartDate: "2026-09-23T06:00:00Z",
      EndDate: "2026-09-23T10:00:00Z",
      Message: "Wrocław ul. Testowa.",
      TypeId: 1,
      IsActive: true,
    },
    {
      OutageId: "prefix-collision-id",
      Modified: "2026-09-03T08:00:00.000Z",
      StartDate: "2026-09-24T06:00:00Z",
      EndDate: "2026-09-24T10:00:00Z",
      Message: "Testowice ul. Testowa.",
      TypeId: 1,
      IsActive: true,
    },
    {
      OutageId: "inactive-id",
      Modified: "2026-09-03T08:00:00.000Z",
      StartDate: "2026-09-25T06:00:00Z",
      EndDate: "2026-09-25T10:00:00Z",
      Message: "Testowo ul. Anulowana.",
      TypeId: 1,
      IsActive: false,
    },
  ],
};

export function createTauronApiMock(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    let payload: unknown;
    if (url.pathname === "/waapi/enum/geo/cities") {
      payload = citiesResponse;
    } else if (url.pathname === "/waapi/enum/geo/streets") {
      payload = streetsResponse;
    } else if (url.pathname === "/waapi/outages/address") {
      payload = outagesResponse;
    } else {
      return new Response("Unknown endpoint", { status: 404 });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  });
}
