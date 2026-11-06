import { describe, expect, it } from "vitest";
import {
  calculatePresetDateRange,
  stepPeriod,
  filterAccountsForStats,
  serializeFilterToQueryParams,
  deserializeFilterFromQueryParams,
  type FilterState,
  type PeriodPreset,
} from "./test-harness";

describe("Universal Filter Engine (Tiers 1-3)", () => {
  const REF_DATE = "2026-11-06"; // Friday, Nov 6, 2026

  // ==========================================================================
  // Tier 1: Feature Coverage (Primary Path Contracts)
  // ==========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: calculates 7D preset ending on reference date (7 days inclusive)", () => {
      const range = calculatePresetDateRange("7D", REF_DATE);
      expect(range.endDate).toBe("2026-11-06");
      expect(range.startDate).toBe("2026-10-31");
    });

    it("T1.2: calculates 30D preset ending on reference date (30 days inclusive)", () => {
      const range = calculatePresetDateRange("30D", REF_DATE);
      expect(range.endDate).toBe("2026-11-06");
      expect(range.startDate).toBe("2026-10-08");
    });

    it("T1.3: calculates 12W preset ending on reference date (84 days inclusive)", () => {
      const range = calculatePresetDateRange("12W", REF_DATE);
      expect(range.endDate).toBe("2026-11-06");
      expect(range.startDate).toBe("2026-08-15");
    });

    it("T1.4: calculates 6M preset from 6 months prior to reference date", () => {
      const range = calculatePresetDateRange("6M", REF_DATE);
      expect(range.endDate).toBe("2026-11-06");
      expect(range.startDate).toBe("2026-05-06");
    });

    it("T1.5: calculates 1Y preset from 1 year prior to reference date", () => {
      const range = calculatePresetDateRange("1Y", REF_DATE);
      expect(range.endDate).toBe("2026-11-06");
      expect(range.startDate).toBe("2025-11-06");
    });

    it("T1.6: calculates this_month preset as full calendar month", () => {
      const range = calculatePresetDateRange("this_month", REF_DATE);
      expect(range.startDate).toBe("2026-11-01");
      expect(range.endDate).toBe("2026-11-30");
    });

    it("T1.7: calculates last_month preset as full previous calendar month", () => {
      const range = calculatePresetDateRange("last_month", REF_DATE);
      expect(range.startDate).toBe("2026-10-01");
      expect(range.endDate).toBe("2026-10-31");
    });

    it("T1.8: calculates this_year and last_year presets accurately", () => {
      const thisYear = calculatePresetDateRange("this_year", REF_DATE);
      expect(thisYear.startDate).toBe("2026-01-01");
      expect(thisYear.endDate).toBe("2026-12-31");

      const lastYear = calculatePresetDateRange("last_year", REF_DATE);
      expect(lastYear.startDate).toBe("2025-01-01");
      expect(lastYear.endDate).toBe("2025-12-31");
    });

    it("T1.9: stepPeriod steps 7D preset backward and forward by 7 days", () => {
      const initial = { preset: "7D" as PeriodPreset, startDate: "2026-10-31", endDate: "2026-11-06" };
      const steppedBack = stepPeriod(initial, -1);
      expect(steppedBack.startDate).toBe("2026-10-24");
      expect(steppedBack.endDate).toBe("2026-10-30");

      const steppedForward = stepPeriod({ preset: "7D", ...steppedBack }, 1);
      expect(steppedForward.startDate).toBe("2026-10-31");
      expect(steppedForward.endDate).toBe("2026-11-06");
    });

    it("T1.10: stepPeriod steps this_month across calendar month boundaries", () => {
      const initial = { preset: "this_month" as PeriodPreset, startDate: "2026-11-01", endDate: "2026-11-30" };
      const oct = stepPeriod(initial, -1);
      expect(oct.startDate).toBe("2026-10-01");
      expect(oct.endDate).toBe("2026-10-31");

      const dec = stepPeriod(initial, 1);
      expect(dec.startDate).toBe("2026-12-01");
      expect(dec.endDate).toBe("2026-12-31");
    });

    it("T1.11: account filtering default all_stats excludes include_net_worth === false", () => {
      const accounts = [
        { id: "1", name: "Checking", include_net_worth: true },
        { id: "2", name: "Savings", attributes: { include_net_worth: true } },
        { id: "3", name: "Secret Stash", include_net_worth: false },
        { id: "4", name: "Excluded Account", attributes: { include_net_worth: false } },
        { id: "5", name: "Default Account" }, // undefined treated as included
      ];

      const filtered = filterAccountsForStats(accounts, "all_stats");
      const ids = filtered.map((a) => a.id);
      expect(ids).toEqual(["1", "2", "5"]);
    });

    it("T1.12: account filtering mode 'all' preserves all accounts", () => {
      const accounts = [
        { id: "1", include_net_worth: true },
        { id: "2", include_net_worth: false },
      ];
      const filtered = filterAccountsForStats(accounts, "all");
      expect(filtered.length).toBe(2);
    });

    it("T1.13: account filtering mode 'custom' filters by selectedAccountIds", () => {
      const accounts = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const filtered = filterAccountsForStats(accounts, "custom", ["2", "3"]);
      expect(filtered.map((a) => a.id)).toEqual(["2", "3"]);
    });

    it("T1.14: serializes and deserializes filter state to query params", () => {
      const state: FilterState = {
        preset: "30D",
        startDate: "2026-10-08",
        endDate: "2026-11-06",
        accountFilter: "custom",
        selectedAccountIds: ["acc-1", "acc-2"],
      };

      const qp = serializeFilterToQueryParams(state);
      expect(qp.get("period")).toBe("30D");
      expect(qp.get("start")).toBe("2026-10-08");
      expect(qp.get("end")).toBe("2026-11-06");
      expect(qp.get("account_filter")).toBe("custom");
      expect(qp.getAll("accounts[]")).toEqual(["acc-1", "acc-2"]);

      const parsed = deserializeFilterFromQueryParams(qp);
      expect(parsed.preset).toBe("30D");
      expect(parsed.startDate).toBe("2026-10-08");
      expect(parsed.endDate).toBe("2026-11-06");
      expect(parsed.accountFilter).toBe("custom");
      expect(parsed.selectedAccountIds).toEqual(["acc-1", "acc-2"]);
    });
  });

  // ==========================================================================
  // Tier 2: Boundary & Corner Cases (Robustness & Edge Conditions)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: leap year boundary: stepping into February 2024 yields 29 days", () => {
      // Step backward from March 2024 to February 2024 (leap year)
      const march2024 = { preset: "this_month" as PeriodPreset, startDate: "2024-03-01", endDate: "2024-03-31" };
      const feb2024 = stepPeriod(march2024, -1);

      expect(feb2024.startDate).toBe("2024-02-01");
      expect(feb2024.endDate).toBe("2024-02-29");
    });

    it("T2.2: non-leap year boundary: stepping into February 2025 yields 28 days", () => {
      const march2025 = { preset: "this_month" as PeriodPreset, startDate: "2025-03-01", endDate: "2025-03-31" };
      const feb2025 = stepPeriod(march2025, -1);

      expect(feb2025.startDate).toBe("2025-02-01");
      expect(feb2025.endDate).toBe("2025-02-28");
    });

    it("T2.3: year rollover: stepping forward from December transitions to January of next year", () => {
      const dec2026 = { preset: "this_month" as PeriodPreset, startDate: "2026-12-01", endDate: "2026-12-31" };
      const jan2027 = stepPeriod(dec2026, 1);

      expect(jan2027.startDate).toBe("2027-01-01");
      expect(jan2027.endDate).toBe("2027-01-31");
    });

    it("T2.4: year rollover: stepping backward from January transitions to December of previous year", () => {
      const jan2026 = { preset: "this_month" as PeriodPreset, startDate: "2026-01-01", endDate: "2026-01-31" };
      const dec2025 = stepPeriod(jan2026, -1);

      expect(dec2025.startDate).toBe("2025-12-01");
      expect(dec2025.endDate).toBe("2025-12-31");
    });

    it("T2.5: month length transitions: stepping across 30-day and 31-day months", () => {
      // April (30 days) to May (31 days)
      const april = { preset: "this_month" as PeriodPreset, startDate: "2026-04-01", endDate: "2026-04-30" };
      const may = stepPeriod(april, 1);
      expect(may.startDate).toBe("2026-05-01");
      expect(may.endDate).toBe("2026-05-31");

      // July (31 days) to August (31 days)
      const july = { preset: "this_month" as PeriodPreset, startDate: "2026-07-01", endDate: "2026-07-31" };
      const aug = stepPeriod(july, 1);
      expect(aug.startDate).toBe("2026-08-01");
      expect(aug.endDate).toBe("2026-08-31");
    });

    it("T2.6: custom preset stepping shifts by exact span duration in days", () => {
      // 10-day custom span: 2026-05-01 to 2026-05-10
      const custom10d = { preset: "custom" as PeriodPreset, startDate: "2026-05-01", endDate: "2026-05-10" };
      const next10d = stepPeriod(custom10d, 1);
      expect(next10d.startDate).toBe("2026-05-11");
      expect(next10d.endDate).toBe("2026-05-20");

      const prev10d = stepPeriod(custom10d, -1);
      expect(prev10d.startDate).toBe("2026-04-21");
      expect(prev10d.endDate).toBe("2026-04-30");
    });

    it("T2.7: annual stepping shifts 1Y preset by whole calendar years", () => {
      const year = { preset: "this_year" as PeriodPreset, startDate: "2026-01-01", endDate: "2026-12-31" };
      const nextYear = stepPeriod(year, 1);
      expect(nextYear.startDate).toBe("2027-01-01");
      expect(nextYear.endDate).toBe("2027-12-31");
    });

    it("T2.8: query deserialization with empty or malformed inputs falls back gracefully", () => {
      const emptyParams = new URLSearchParams();
      const parsed = deserializeFilterFromQueryParams(emptyParams);
      expect(parsed.preset).toBeUndefined();
      expect(parsed.startDate).toBeUndefined();
      expect(parsed.accountFilter).toBeUndefined();

      const objectParams = { period: "7D", start: "2026-01-01" };
      const parsedObj = deserializeFilterFromQueryParams(objectParams);
      expect(parsedObj.preset).toBe("7D");
      expect(parsedObj.startDate).toBe("2026-01-01");
    });

    it("T2.9: custom account filter with empty selectedAccountIds returns empty list safely", () => {
      const accounts = [{ id: "acc-1" }, { id: "acc-2" }];
      const result = filterAccountsForStats(accounts, "custom", []);
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // Tier 3: Cross-Feature Combinations (Pairwise Interoperability)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: switching preset updates date range while preserving account filter configuration", () => {
      const initial: FilterState = {
        preset: "7D",
        startDate: "2026-10-31",
        endDate: "2026-11-06",
        accountFilter: "custom",
        selectedAccountIds: ["asset-1", "asset-2"],
      };

      const newRange = calculatePresetDateRange("this_month", REF_DATE);
      const updated: FilterState = {
        ...initial,
        preset: "this_month",
        startDate: newRange.startDate,
        endDate: newRange.endDate,
      };

      expect(updated.preset).toBe("this_month");
      expect(updated.startDate).toBe("2026-11-01");
      expect(updated.endDate).toBe("2026-11-30");
      expect(updated.accountFilter).toBe("custom");
      expect(updated.selectedAccountIds).toEqual(["asset-1", "asset-2"]);
    });

    it("T3.2: 12 consecutive monthly steps forward and backward returns precisely to starting month", () => {
      const startMonth = { preset: "this_month" as PeriodPreset, startDate: "2026-01-01", endDate: "2026-01-31" };
      let current = startMonth;

      for (let i = 0; i < 12; i++) {
        current = { ...current, ...stepPeriod(current, 1) };
      }
      expect(current.startDate).toBe("2027-01-01");
      expect(current.endDate).toBe("2027-01-31");

      for (let i = 0; i < 12; i++) {
        current = { ...current, ...stepPeriod(current, -1) };
      }
      expect(current.startDate).toBe("2026-01-01");
      expect(current.endDate).toBe("2026-01-31");
    });

    it("T3.3: query parameter serialization round-trip maintains multiple account IDs", () => {
      const state: FilterState = {
        preset: "1Y",
        startDate: "2025-11-06",
        endDate: "2026-11-06",
        accountFilter: "custom",
        selectedAccountIds: ["checking-1", "savings-2", "brokerage-3"],
      };

      const serialized = serializeFilterToQueryParams(state);
      const restored = deserializeFilterFromQueryParams(serialized);

      expect(restored.preset).toBe("1Y");
      expect(restored.accountFilter).toBe("custom");
      expect(restored.selectedAccountIds).toEqual(["checking-1", "savings-2", "brokerage-3"]);
    });

    it("T3.4: filter engine account filtering correctly feeds portfolio total calculation", () => {
      const accounts = [
        { id: "1", balance: "5000", include_net_worth: true },
        { id: "2", balance: "15000", include_net_worth: true },
        { id: "3", balance: "200000", include_net_worth: false }, // Excluded from stats
      ];

      // With default 'all_stats'
      const statsAccounts = filterAccountsForStats(accounts, "all_stats");
      const statsTotal = statsAccounts.reduce((acc, a) => acc + Number(a.balance), 0);
      expect(statsTotal).toBe(20000); // 5000 + 15000, 200000 ignored

      // With 'all'
      const allAccounts = filterAccountsForStats(accounts, "all");
      const allTotal = allAccounts.reduce((acc, a) => acc + Number(a.balance), 0);
      expect(allTotal).toBe(220000);
    });

    it("T3.5: rapid stepping sequence across year boundary maintains date consistency", () => {
      let state = { preset: "this_month" as PeriodPreset, startDate: "2025-11-01", endDate: "2025-11-30" };
      state = { ...state, ...stepPeriod(state, 1) }; // Dec 2025
      expect(state.startDate).toBe("2025-12-01");
      state = { ...state, ...stepPeriod(state, 1) }; // Jan 2026
      expect(state.startDate).toBe("2026-01-01");
      state = { ...state, ...stepPeriod(state, 1) }; // Feb 2026
      expect(state.startDate).toBe("2026-02-01");
      expect(state.endDate).toBe("2026-02-28");
    });
  });
});
