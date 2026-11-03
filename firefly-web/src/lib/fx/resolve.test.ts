import { describe, expect, it } from "vitest";
import { convert, convertBack, impliedRate, pickRate, resolveRate, type StoredRate } from "./resolve";

function loaderFrom(rates: StoredRate[]) {
  const calls: string[] = [];
  const load = async (from: string, to: string) => {
    calls.push(`${from}/${to}`);
    return rates.filter((r) => r.from === from && r.to === to);
  };
  return { load, calls };
}

describe("pickRate", () => {
  const rates: StoredRate[] = [
    { from: "USD", to: "EUR", rate: "0.90", date: "2026-10-01" },
    { from: "USD", to: "EUR", rate: "0.92", date: "2026-10-20T00:00:00+00:00" },
    { from: "USD", to: "EUR", rate: "0.95", date: "2026-11-05" },
  ];
  it("picks latest on or before date", () => {
    expect(pickRate(rates, "2026-10-25")?.rate.rate).toBe("0.92");
    expect(pickRate(rates, "2026-10-20")?.rate.rate).toBe("0.92");
    expect(pickRate(rates, "2026-10-19")?.rate.rate).toBe("0.90");
  });
  it("falls back to earliest later rate, flagged approximate", () => {
    const r = pickRate(rates, "2026-09-01");
    expect(r?.rate.rate).toBe("0.90");
    expect(r?.approximate).toBe(true);
  });
  it("ignores zero/invalid rates", () => {
    expect(pickRate([{ from: "A", to: "B", rate: "0", date: "2026-01-01" }], "2026-02-01")).toBeNull();
  });
});

describe("resolveRate", () => {
  it("returns identity for same currency", async () => {
    const { load, calls } = loaderFrom([]);
    const r = await resolveRate("EUR", "EUR", "2026-10-31", load);
    expect(r?.rate.toString()).toBe("1");
    expect(r?.source).toBe("identity");
    expect(calls).toHaveLength(0);
  });

  it("uses direct rate", async () => {
    const { load } = loaderFrom([{ from: "USD", to: "EUR", rate: "0.92", date: "2026-10-01" }]);
    const r = await resolveRate("USD", "EUR", "2026-10-31", load);
    expect(r?.source).toBe("direct");
    expect(r?.rate.toString()).toBe("0.92");
  });

  it("uses inverse rate when only reverse pair exists", async () => {
    const { load } = loaderFrom([{ from: "EUR", to: "USD", rate: "1.25", date: "2026-10-01" }]);
    const r = await resolveRate("USD", "EUR", "2026-10-31", load);
    expect(r?.source).toBe("inverse");
    expect(r?.rate.toString()).toBe("0.8");
  });

  it("handles Firefly III bidirectional response (returns BHD->USD when querying USD/BHD)", async () => {
    // Firefly III's GET /exchange-rates/USD/BHD returns records where from=BHD, to=USD (rate 2.65)
    // as well as records where from=USD, to=BHD (rate 0.376), or only the BHD->USD record!
    const bidirectionalLoad = async (from: string, to: string): Promise<StoredRate[]> => {
      const all: StoredRate[] = [{ from: "BHD", to: "USD", rate: "2.65", date: "2026-01-01" }];
      return all.filter((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from));
    };
    const rUsdToBhd = await resolveRate("USD", "BHD", "2026-10-31", bidirectionalLoad, "BHD");
    expect(rUsdToBhd?.source).toBe("inverse");
    expect(rUsdToBhd?.rate.toDecimalPlaces(4).toString()).toBe("0.3774"); // 1 / 2.65

    const rBhdToUsd = await resolveRate("BHD", "USD", "2026-10-31", bidirectionalLoad, "BHD");
    expect(rBhdToUsd?.source).toBe("direct");
    expect(rBhdToUsd?.rate.toString()).toBe("2.65");
  });

  it("prefers the newer of direct and inverse", async () => {
    const { load } = loaderFrom([
      { from: "USD", to: "EUR", rate: "0.90", date: "2026-09-01" },
      { from: "EUR", to: "USD", rate: "1.25", date: "2026-10-15" },
    ]);
    const r = await resolveRate("USD", "EUR", "2026-10-31", load);
    expect(r?.source).toBe("inverse");
  });

  it("triangulates through primary currency", async () => {
    const { load } = loaderFrom([
      { from: "USD", to: "SAR", rate: "3.75", date: "2026-10-01" },
      { from: "EUR", to: "SAR", rate: "4", date: "2026-10-10" },
    ]);
    const r = await resolveRate("USD", "EUR", "2026-10-31", load, "SAR");
    expect(r?.source).toBe("triangulated");
    expect(r?.path).toEqual(["USD", "SAR", "EUR"]);
    expect(r?.rate.toString()).toBe("0.9375");
    expect(r?.date).toBe("2026-10-01");
  });

  it("returns null when nothing is known", async () => {
    const { load } = loaderFrom([]);
    expect(await resolveRate("USD", "EUR", "2026-10-31", load, "SAR")).toBeNull();
  });
});

describe("conversion helpers", () => {
  it("converts with rounding", () => {
    expect(convert("100", "0.92345")).toBe("92.35");
    expect(convert("100", "3.75", 3)).toBe("375.000");
    expect(convertBack("92.35", "0.92345")).toBe("100.01");
  });
  it("computes implied rate", () => {
    expect(impliedRate("100", "92")?.toString()).toBe("0.92");
    expect(impliedRate("0", "92")).toBeNull();
  });
});
