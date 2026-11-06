import { describe, expect, it } from "vitest";
import {
  getPresetDateRange,
  stepPeriod,
  getPriorPeriod,
  filterAccountsForStats,
  serializeFilterToQueryParams,
  deserializeFilterFromQueryParams,
  formatDate,
  parseDate,
  addDays,
  isValidPreset,
  PERIOD_PRESETS,
  type PeriodPreset,
} from "@/lib/filter-presets";
import { qs } from "@/lib/firefly/api";

describe("Milestone 1 Adversarial Challenge & Stress Tests", () => {
  // ==========================================================================
  // Section 1: Leap Year & Boundary Stepping Stress Tests
  // ==========================================================================
  describe("1. Leap Year Transitions & Stepping", () => {
    it("1.1: 1Y step forward from leap day 2024-02-29 clamps to 2025-02-28", () => {
      const initial = { preset: "1Y" as PeriodPreset, startDate: "2023-02-28", endDate: "2024-02-29" };
      const next = stepPeriod(initial, 1);
      expect(next.endDate).toBe("2025-02-28");
    });

    it("1.2: 1Y step forward 4 times from leap day lands on next leap day 2028-02-29", () => {
      let current = { preset: "1Y" as PeriodPreset, startDate: "2023-02-28", endDate: "2024-02-29" };
      // 2024 -> 2025 -> 2026 -> 2027 -> 2028
      current = { preset: "1Y", ...stepPeriod(current, 1) };
      expect(current.endDate).toBe("2025-02-28");
      current = { preset: "1Y", ...stepPeriod(current, 1) };
      expect(current.endDate).toBe("2026-02-28");
      current = { preset: "1Y", ...stepPeriod(current, 1) };
      expect(current.endDate).toBe("2027-02-28");
      current = { preset: "1Y", ...stepPeriod(current, 1) };
      // Since 2027-02-28 is day 28, 1 year later is day 28 (2028-02-28)
      expect(current.endDate).toBe("2028-02-28");
    });

    it("1.3: 6M stepping from 2024-08-31 backward clamps to leap day 2024-02-29", () => {
      const range = getPresetDateRange("6M", "2024-08-31");
      expect(range.startDate).toBe("2024-02-29");
      expect(range.endDate).toBe("2024-08-31");
    });

    it("1.4: 6M stepping from 2025-08-31 backward clamps to non-leap Feb 28 (2025-02-28)", () => {
      const range = getPresetDateRange("6M", "2025-08-31");
      expect(range.startDate).toBe("2025-02-28");
      expect(range.endDate).toBe("2025-08-31");
    });

    it("1.5: stepping this_month into leap month (Feb 2024) yields 29 days, non-leap yields 28", () => {
      const march2024 = { preset: "this_month" as PeriodPreset, startDate: "2024-03-01", endDate: "2024-03-31" };
      const feb2024 = stepPeriod(march2024, -1);
      expect(feb2024.startDate).toBe("2024-02-01");
      expect(feb2024.endDate).toBe("2024-02-29");

      const march2025 = { preset: "this_month" as PeriodPreset, startDate: "2025-03-01", endDate: "2025-03-31" };
      const feb2025 = stepPeriod(march2025, -1);
      expect(feb2025.startDate).toBe("2025-02-01");
      expect(feb2025.endDate).toBe("2025-02-28");
    });

    it("1.6: getPriorPeriod on March 5 2024 (5 days) ends exactly on Feb 29 2024", () => {
      // 5 days: Mar 1, Mar 2, Mar 3, Mar 4, Mar 5
      const prior = getPriorPeriod("2024-03-01", "2024-03-05");
      expect(prior.endDate).toBe("2024-02-29");
      expect(prior.startDate).toBe("2024-02-25"); // 5 days: Feb 25, 26, 27, 28, 29
    });

    it("1.7: getPriorPeriod on March 5 2025 (5 days) ends exactly on Feb 28 2025", () => {
      const prior = getPriorPeriod("2025-03-01", "2025-03-05");
      expect(prior.endDate).toBe("2025-02-28");
      expect(prior.startDate).toBe("2025-02-24"); // 5 days: Feb 24, 25, 26, 27, 28
    });
  });

  // ==========================================================================
  // Section 2: Year Boundaries & Extreme Spans
  // ==========================================================================
  describe("2. Year Boundaries & Multi-Step Reversibility", () => {
    it("2.1: stepping across year boundary 2024 -> 2025 preserves month length and day precision", () => {
      const dec2024 = { preset: "this_month" as PeriodPreset, startDate: "2024-12-01", endDate: "2024-12-31" };
      const jan2025 = stepPeriod(dec2024, 1);
      expect(jan2025.startDate).toBe("2025-01-01");
      expect(jan2025.endDate).toBe("2025-01-31");

      const steppedBack = stepPeriod({ preset: "this_month", ...jan2025 }, -1);
      expect(steppedBack.startDate).toBe("2024-12-01");
      expect(steppedBack.endDate).toBe("2024-12-31");
    });

    it("2.2: 120 consecutive monthly steps forward and backward (10 years) has ZERO drift", () => {
      let cur = { preset: "this_month" as PeriodPreset, startDate: "2020-01-01", endDate: "2020-01-31" };
      for (let i = 0; i < 120; i++) {
        const next = stepPeriod(cur, 1);
        cur = { preset: "this_month", startDate: next.startDate, endDate: next.endDate };
      }
      expect(cur.startDate).toBe("2030-01-01");
      expect(cur.endDate).toBe("2030-01-31");

      for (let i = 0; i < 120; i++) {
        const prev = stepPeriod(cur, -1);
        cur = { preset: "this_month", startDate: prev.startDate, endDate: prev.endDate };
      }
      expect(cur.startDate).toBe("2020-01-01");
      expect(cur.endDate).toBe("2020-01-31");
    });

    it("2.3: custom preset 1-day range steps forward and backward exactly 1 day", () => {
      const singleDay = { preset: "custom" as PeriodPreset, startDate: "2024-02-29", endDate: "2024-02-29" };
      const nextDay = stepPeriod(singleDay, 1);
      expect(nextDay.startDate).toBe("2024-03-01");
      expect(nextDay.endDate).toBe("2024-03-01");

      const prevDay = stepPeriod(singleDay, -1);
      expect(prevDay.startDate).toBe("2024-02-28");
      expect(prevDay.endDate).toBe("2024-02-28");
    });

    it("2.4: custom preset extreme span (1000 days) steps accurately", () => {
      const startStr = "2020-01-01";
      const startD = parseDate(startStr);
      const endD = addDays(startD, 999); // 1000 days inclusive
      const endStr = formatDate(endD);

      const span1000 = { preset: "custom" as PeriodPreset, startDate: startStr, endDate: endStr };
      const nextSpan = stepPeriod(span1000, 1);
      const expectedNextStart = formatDate(addDays(endD, 1));
      const expectedNextEnd = formatDate(addDays(addDays(endD, 1), 999));

      expect(nextSpan.startDate).toBe(expectedNextStart);
      expect(nextSpan.endDate).toBe(expectedNextEnd);

      const restored = stepPeriod({ preset: "custom", startDate: nextSpan.startDate, endDate: nextSpan.endDate }, -1);
      expect(restored.startDate).toBe(startStr);
      expect(restored.endDate).toBe(endStr);
    });

    it("2.5: custom preset inverted date range falls back to minimum 1-day step without crashing", () => {
      const inverted = { preset: "custom" as PeriodPreset, startDate: "2026-05-10", endDate: "2026-05-01" };
      const stepped = stepPeriod(inverted, 1);
      expect(stepped.startDate).toBe("2026-05-11");
      expect(stepped.endDate).toBe("2026-05-02");
    });

    it("2.6: overloaded stepPeriod accepts both 4-argument and object formats identically", () => {
      const range4 = stepPeriod("7D", "2026-11-01", "2026-11-07", 1);
      const rangeObj = stepPeriod({ preset: "7D", startDate: "2026-11-01", endDate: "2026-11-07" }, 1);
      const rangeObjAlt = stepPeriod({ preset: "7D", start: "2026-11-01", end: "2026-11-07" }, 1);

      expect(range4.startDate).toBe(rangeObj.startDate);
      expect(range4.endDate).toBe(rangeObj.endDate);
      expect(rangeObj.startDate).toBe(rangeObjAlt.startDate);
      expect(rangeObj.endDate).toBe(rangeObjAlt.endDate);
      expect(range4.start).toBe(range4.startDate);
      expect(range4.end).toBe(range4.endDate);
    });
  });

  // ==========================================================================
  // Section 3: Preset Completeness & Inclusive Days Verification
  // ==========================================================================
  describe("3. Preset Completeness & Inclusive Days", () => {
    it("3.1: all 10 presets are registered in PERIOD_PRESETS and validate via isValidPreset", () => {
      const expectedPresets: PeriodPreset[] = [
        "7D", "30D", "12W", "6M", "1Y",
        "this_month", "last_month", "this_year", "last_year", "custom"
      ];
      expect(PERIOD_PRESETS.length).toBe(10);
      for (const p of expectedPresets) {
        expect(isValidPreset(p)).toBe(true);
        expect(PERIOD_PRESETS.some((item) => item.key === p)).toBe(true);
      }
      expect(isValidPreset("invalid_preset")).toBe(false);
      expect(isValidPreset(null)).toBe(false);
      expect(isValidPreset(undefined)).toBe(false);
      expect(isValidPreset(123)).toBe(false);
    });

    it("3.2: 7D, 30D, and 12W have exact inclusive calendar day counts across leap year", () => {
      const leapRef = "2024-03-05";
      const countDays = (start: string, end: string) => {
        const s = parseDate(start);
        const e = parseDate(end);
        return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      };

      const range7 = getPresetDateRange("7D", leapRef);
      expect(countDays(range7.start, range7.end)).toBe(7);

      const range30 = getPresetDateRange("30D", leapRef);
      expect(countDays(range30.start, range30.end)).toBe(30);

      const range12W = getPresetDateRange("12W", leapRef);
      expect(countDays(range12W.start, range12W.end)).toBe(84);
    });

    it("3.3: getPresetDateRange accepts Date instance and string reference identically", () => {
      const strRes = getPresetDateRange("this_month", "2026-11-15");
      const dateRes = getPresetDateRange("this_month", new Date(2026, 10, 15));

      expect(strRes.startDate).toBe("2026-11-01");
      expect(strRes.endDate).toBe("2026-11-30");
      expect(dateRes.startDate).toBe("2026-11-01");
      expect(dateRes.endDate).toBe("2026-11-30");
    });
  });

  // ==========================================================================
  // Section 4: Account Filtering Robustness
  // ==========================================================================
  describe("4. Account Filtering Robustness", () => {
    it("4.1: correctly handles conflicting or nested include_net_worth definitions", () => {
      const accounts = [
        { id: "1", include_net_worth: true },
        { id: "2", include_net_worth: false },
        { id: "3", attributes: { include_net_worth: true } },
        { id: "4", attributes: { include_net_worth: false } },
        { id: "5", include_net_worth: true, attributes: { include_net_worth: false } }, // Attribute false wins
        { id: "6", include_net_worth: false, attributes: { include_net_worth: true } }, // Root false wins
        { id: "7" }, // Undefined defaults to included
      ];

      const filtered = filterAccountsForStats(accounts, "all_stats");
      const ids = filtered.map((a) => a.id);
      expect(ids).toEqual(["1", "3", "7"]);
    });

    it("4.2: custom account filter coerces numeric account IDs to string cleanly", () => {
      const accounts = [{ id: "10" }, { id: "20" }, { id: "30" }];
      const filtered = filterAccountsForStats(accounts, "custom", ["20"]);
      expect(filtered.map((a) => a.id)).toEqual(["20"]);
    });

    it("4.3: empty or malformed accounts array does not throw", () => {
      expect(filterAccountsForStats([], "all_stats")).toEqual([]);
      expect(filterAccountsForStats([], "custom", ["1"])).toEqual([]);
      expect(filterAccountsForStats([], "all")).toEqual([]);
    });
  });

  // ==========================================================================
  // Section 5: Query Serialization & Deserialization
  // ==========================================================================
  describe("5. Query Parameter Serialization & Deserialization", () => {
    it("5.1: round-trip serialization and deserialization with URLSearchParams", () => {
      const params = serializeFilterToQueryParams({
        preset: "12W",
        startDate: "2026-08-15",
        endDate: "2026-11-06",
        accountFilter: "custom",
        selectedAccountIds: ["acc-a", "acc-b"],
      });

      const parsed = deserializeFilterFromQueryParams(params);
      expect(parsed.preset).toBe("12W");
      expect(parsed.startDate).toBe("2026-08-15");
      expect(parsed.endDate).toBe("2026-11-06");
      expect(parsed.accountFilter).toBe("custom");
      expect(parsed.selectedAccountIds).toEqual(["acc-a", "acc-b"]);
    });

    it("5.2: deserialization gracefully parses comma-separated accounts and legacy keys", () => {
      const sp = new URLSearchParams("preset=30D&start=2026-01-01&end=2026-01-30&account_filter=custom&accounts=acc-1,acc-2,acc-3");
      const parsed = deserializeFilterFromQueryParams(sp);
      expect(parsed.preset).toBe("30D");
      expect(parsed.startDate).toBe("2026-01-01");
      expect(parsed.endDate).toBe("2026-01-30");
      expect(parsed.accountFilter).toBe("custom");
      expect(parsed.selectedAccountIds).toEqual(["acc-1", "acc-2", "acc-3"]);
    });

    it("5.3: deserialization rejects invalid presets and falls back gracefully", () => {
      const sp = new URLSearchParams("period=HACK_PRESET&start=2026-01-01");
      const parsed = deserializeFilterFromQueryParams(sp);
      expect(parsed.preset).toBeUndefined();
      expect(parsed.startDate).toBe("2026-01-01");
    });

    it("5.4: deserialization from plain object dictionary", () => {
      const obj = {
        period: "6M",
        startDate: "2026-05-01",
        endDate: "2026-11-01",
        accountFilter: "all_stats",
        "accounts[]": ["1", "2"],
      };
      const parsed = deserializeFilterFromQueryParams(obj);
      expect(parsed.preset).toBe("6M");
      expect(parsed.startDate).toBe("2026-05-01");
      expect(parsed.endDate).toBe("2026-11-01");
      expect(parsed.selectedAccountIds).toEqual(["1", "2"]);
    });
  });

  // ==========================================================================
  // Section 6: Firefly qs() Array Serialization Adversarial Tests
  // ==========================================================================
  describe("6. Firefly API qs() Adversarial Tests", () => {
    it("6.1: returns empty string for empty, undefined, null or whitespace params", () => {
      expect(qs(undefined)).toBe("");
      expect(qs(null as unknown as Record<string, string>)).toBe("");
      expect(qs({})).toBe("");
      expect(qs({ a: undefined, b: null, c: "" })).toBe("");
    });

    it("6.2: preserves falsy values that are valid query values (0 and false)", () => {
      const res = qs({ page: 0, active: false });
      expect(res).toBe("?page=0&active=false");
    });

    it("6.3: serializes array parameters with accounts[]=1&accounts[]=2 bracket notation", () => {
      const res = qs({ start: "2026-01-01", accounts: ["1", "2", "3"] });
      expect(res).toBe("?start=2026-01-01&accounts%5B%5D=1&accounts%5B%5D=2&accounts%5B%5D=3");
    });

    it("6.4: prevents double-bracket notation when key already ends with []", () => {
      const res = qs({ "accounts[]": ["1", "2"] });
      expect(res).toBe("?accounts%5B%5D=1&accounts%5B%5D=2");
      expect(res).not.toContain("accounts%5B%5D%5B%5D");
    });

    it("6.5: omits empty arrays completely without trailing ?", () => {
      expect(qs({ accounts: [] })).toBe("");
      expect(qs({ start: "2026-01-01", accounts: [] })).toBe("?start=2026-01-01");
    });

    it("6.6: filters null, undefined, and empty string elements inside arrays while preserving valid values", () => {
      const res = qs({
        accounts: [null, undefined, "", "10", 20] as unknown as string[],
      });
      expect(res).toBe("?accounts%5B%5D=10&accounts%5B%5D=20");
    });

    it("6.7: serializes nested array items safely using String coercion", () => {
      const res = qs({ nested: [["sub1", "sub2"]] as unknown as string[] });
      expect(res).toBe("?nested%5B%5D=sub1%2Csub2");
    });

    it("6.8: serializes symbols and special characters safely", () => {
      const res = qs({ sym: Symbol("metric") as unknown as string, query: "groceries & food = true" });
      expect(res).toContain("sym=Symbol%28metric%29");
      expect(res).toContain("query=groceries+%26+food+%3D+true");
    });
  });
});
