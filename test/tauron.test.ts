import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOutageSchedule, resolveAddress } from "../src/tauron";
import { createTauronApiMock } from "./fixtures";

const address = {
  city: "Testowo",
  street: "Testowa",
  houseNumber: "1",
  messagePrefix: "Testowo",
};

describe("Tauron API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves exact city and street names", async () => {
    vi.stubGlobal("fetch", createTauronApiMock());

    await expect(resolveAddress(address)).resolves.toEqual({
      cityGaid: 119001,
      cityName: "Testowo",
      streetGaid: 971131,
      streetName: "Testowa",
    });
  });

  it("requests the rolling window and keeps only active whole-prefix matches", async () => {
    const fetchMock = createTauronApiMock();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOutageSchedule(
      address,
      new Date("2026-09-17T08:00:00Z"),
    );

    expect(result.rawOutageCount).toBe(6);
    expect(result.outages).toHaveLength(3);
    expect(result.outages.map(({ id }) => id)).toEqual([
      "unplanned-id",
      "planned-shared-id",
      "planned-shared-id",
    ]);

    const outageCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/waapi/outages/address"),
    );
    const url = new URL(String(outageCall?.[0]));
    expect(url.searchParams.get("fromDate")).toBe("2026-09-10T08:00:00");
    expect(url.searchParams.get("toDate")).toBe("2026-10-17T08:00:00");
    expect(url.searchParams.get("cityGAID")).toBe("119001");
    expect(url.searchParams.get("streetGAID")).toBe("971131");
    expect(url.searchParams.get("houseNo")).toBe("1");
  });

  it("reuses a cached address resolution", async () => {
    const fetchMock = createTauronApiMock();
    vi.stubGlobal("fetch", fetchMock);

    await fetchOutageSchedule(address, new Date("2026-09-17T08:00:00Z"), {
      cityGaid: 119001,
      cityName: "Testowo",
      streetGaid: 971131,
      streetName: "Testowa",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed outage data instead of clearing a valid calendar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/waapi/enum/geo/cities") {
          return Response.json([{ GAID: 119001, Name: "Testowo" }]);
        }
        if (url.pathname === "/waapi/enum/geo/streets") {
          return Response.json([
            {
              GAID: 971131,
              Name: "Testowa",
              ShortName: "Testowa",
              FullName: "Testowa",
            },
          ]);
        }
        return Response.json({ unexpected: [] });
      }),
    );

    await expect(
      fetchOutageSchedule(address, new Date("2026-09-17T08:00:00Z")),
    ).rejects.toThrow("invalid shape");
  });
});
