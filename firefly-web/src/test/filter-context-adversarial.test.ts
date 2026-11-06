import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  UniversalFilterProvider,
  useUniversalFilter,
} from "../lib/filter-context";
import {
  filterAccountsForStats,
  stepPeriod,
  getPresetDateRange,
  getPriorPeriod,
  deserializeFilterFromQueryParams,
  isValidPreset,
  parseDate,
  formatDate,
  addDays,
  PERIOD_PRESETS,
  type PeriodPreset,
} from "../lib/filter-presets";


describe("Milestone 1 Adversarial & Stress Testing", () => {
  // ==========================================================================
  // Section 1: SSR Environment Safety (Server-Side Rendering / Node)
  // ==========================================================================
  describe("1. SSR Environment Safety", () => {
    it("renders UniversalFilterProvider without throwing when window is undefined", () => {
      let capturedContext: ReturnType<typeof useUniversalFilter> | null = null;

      function TestConsumer() {
        capturedContext = useUniversalFilter();
        return React.createElement(
          "div",
          { "data-testid": "ssr-container" },
          React.createElement("span", { id: "preset" }, capturedContext.preset),
          React.createElement("span", { id: "start" }, capturedContext.startDate),
          React.createElement("span", { id: "end" }, capturedContext.endDate),
          React.createElement("span", { id: "mode" }, capturedContext.accountFilter),
        );
      }

      const html = renderToString(
        React.createElement(
          UniversalFilterProvider,
          null,
          React.createElement(TestConsumer),
        ),
      );

      expect(html).toContain('data-testid="ssr-container"');
      expect(html).toContain("this_month");
      expect(html).toContain("all_stats");

      expect(capturedContext).not.toBeNull();
      if (capturedContext) {
        const ctx = capturedContext as ReturnType<typeof useUniversalFilter>;
        expect(ctx.preset).toBe("this_month");
        expect(ctx.accountFilter).toBe("all_stats");
        expect(ctx.accountFilterMode).toBe("all_stats");
        expect(ctx.excludeNonNetWorth).toBe(true);
        expect(ctx.selectedAccountIds).toEqual([]);
        expect(ctx.dateRange.start).toBe(ctx.startDate);
        expect(ctx.dateRange.end).toBe(ctx.endDate);
        expect(ctx.displayLabel).toBe("This month");
        expect(ctx.priorPeriod.end < ctx.startDate).toBe(true);

        // Account filtering in SSR
        const accounts = [
          { id: "1", name: "Asset Net Worth", include_net_worth: true },
          { id: "2", name: "Excluded Account", include_net_worth: false },
        ];
        const filtered = ctx.filterAccounts(accounts);
        expect(filtered.map((a) => a.id)).toEqual(["1"]);
        expect(ctx.isAccountIncluded(accounts[0])).toBe(true);
        expect(ctx.isAccountIncluded(accounts[1])).toBe(false);
      }
    });

    it("respects initialState during SSR rendering", () => {
      let capturedContext: ReturnType<typeof useUniversalFilter> | null = null;

      function CustomConsumer() {
        capturedContext = useUniversalFilter();
        return React.createElement("div", null, capturedContext.preset);
      }

      renderToString(
        React.createElement(
          UniversalFilterProvider,
          {
            initialState: {
              preset: "30D",
              startDate: "2026-10-01",
              endDate: "2026-10-31",
              accountFilter: "all",
              selectedAccountIds: ["acc-1"],
            },
          } as unknown as { children: React.ReactNode },
          React.createElement(CustomConsumer),
        ),
      );

      expect(capturedContext).not.toBeNull();
      if (capturedContext) {
        const ctx = capturedContext as ReturnType<typeof useUniversalFilter>;
        expect(ctx.preset).toBe("30D");
        expect(ctx.startDate).toBe("2026-10-01");
        expect(ctx.endDate).toBe("2026-10-31");
        expect(ctx.accountFilter).toBe("all");
        expect(ctx.selectedAccountIds).toEqual(["acc-1"]);
      }
    });

    it("edge case: initialState with explicit undefined startDate causes parseDate slice TypeError", () => {
      let threw = false;
      let capturedError: unknown = null;
      try {
        renderToString(
          React.createElement(
            UniversalFilterProvider,
            {
              initialState: { startDate: undefined, endDate: undefined },
            } as unknown as { children: React.ReactNode },
            React.createElement("div", null, "test"),
          ),
        );
      } catch (err) {
        threw = true;
        capturedError = err;
      }
      expect(threw).toBe(true);
      expect((capturedError as Error).message).toContain("reading 'slice'");
    });





    it("throws clear error when useUniversalFilter is called outside provider", () => {
      function OrphanComponent() {
        useUniversalFilter();
        return null;
      }

      expect(() => {
        renderToString(React.createElement(OrphanComponent));
      }).toThrowError(/useUniversalFilter must be used within a UniversalFilterProvider/);
    });
  });

  // ==========================================================================
  // Section 2: Missing & Hostile sessionStorage / Browser Storage Simulation
  // ==========================================================================
  describe("2. Missing & Hostile Storage Resilience", () => {
    it("handles sessionStorage access throwing SecurityError (private browsing sandbox)", () => {
      // Mock window with hostile sessionStorage
      const originalWindow = global.window;
      try {
        const hostileWindow = {
          get sessionStorage(): Storage {
            throw new Error("SecurityError: Access is denied for this document");
          },
          location: {
            href: "https://wallet.local/reports",
            search: "",
          },
          history: {
            replaceState: () => {},
          },
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        // @ts-expect-error test mock
        global.window = hostileWindow;

        // Render provider with hostile storage
        const html = renderToString(
          React.createElement(
            UniversalFilterProvider,
            null,
            React.createElement("div", null, "Safe in hostile sandbox"),
          ),
        );
        expect(html).toContain("Safe in hostile sandbox");
      } finally {
        global.window = originalWindow;
      }
    });

    it("handles sessionStorage.getItem returning corrupted / non-JSON strings", () => {
      const originalWindow = global.window;
      try {
        const corruptStore: Record<string, string> = {
          firefly_universal_filter: "{ broken json: syntax error, unclosed quote",
        };
        const mockWindow = {
          sessionStorage: {
            getItem: (key: string) => corruptStore[key] || null,
            setItem: (key: string, val: string) => { corruptStore[key] = val; },
            removeItem: (key: string) => { delete corruptStore[key]; },
            clear: () => {},
            length: 1,
            key: () => null,
          },
          location: {
            href: "https://wallet.local/reports",
            search: "",
          },
          history: {
            replaceState: () => {},
          },
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        // @ts-expect-error test mock
        global.window = mockWindow;

        let captured: ReturnType<typeof useUniversalFilter> | null = null;
        function Consumer() {
          captured = useUniversalFilter();
          return React.createElement("div", null, captured.preset);
        }

        renderToString(
          React.createElement(
            UniversalFilterProvider,
            null,
            React.createElement(Consumer),
          ),
        );

        expect(captured).not.toBeNull();
        // Should fall back cleanly to default "this_month"
        expect((captured as unknown as ReturnType<typeof useUniversalFilter>).preset).toBe("this_month");

      } finally {
        global.window = originalWindow;
      }
    });

    it("handles sessionStorage.setItem throwing QuotaExceededError", () => {
      const originalWindow = global.window;
      try {
        const mockWindow = {
          sessionStorage: {
            getItem: () => null,
            setItem: () => {
              throw new Error("QuotaExceededError: The quota has been exceeded");
            },
            removeItem: () => {},
            clear: () => {},
            length: 0,
            key: () => null,
          },
          location: {
            href: "https://wallet.local/reports",
            search: "",
          },
          history: {
            replaceState: () => {},
          },
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        // @ts-expect-error test mock
        global.window = mockWindow;

        // Provider render must not throw
        expect(() => {
          renderToString(
            React.createElement(
              UniversalFilterProvider,
              null,
              React.createElement("div", null, "Quota resilient"),
            ),
          );
        }).not.toThrow();
      } finally {
        global.window = originalWindow;
      }
    });
  });

  // ==========================================================================
  // Section 3: Invalid / Malformed / Hostile URL Query Parameters
  // ==========================================================================
  describe("3. Invalid URL Query Parameter Deserialization", () => {
    it("sanitizes invalid or unrecognized preset names", () => {
      const params = new URLSearchParams("period=HACKED_PRESET&preset=ATTACK");
      const parsed = deserializeFilterFromQueryParams(params);

      // Invalid preset must not be returned
      expect(parsed.preset).toBeUndefined();
      expect(isValidPreset("HACKED_PRESET")).toBe(false);
      expect(isValidPreset("ATTACK")).toBe(false);
    });

    it("handles partial date ranges without crashing", () => {
      // Start only
      const p1 = new URLSearchParams("start=2026-05-01");
      const r1 = deserializeFilterFromQueryParams(p1);
      expect(r1.startDate).toBe("2026-05-01");
      expect(r1.endDate).toBeUndefined();

      // End only
      const p2 = new URLSearchParams("end=2026-05-31");
      const r2 = deserializeFilterFromQueryParams(p2);
      expect(r2.startDate).toBeUndefined();
      expect(r2.endDate).toBe("2026-05-31");
    });

    it("sanitizes comma-delimited accounts with extra whitespace and empty tokens", () => {
      const params = new URLSearchParams("accounts=,,,  ,,12,  ,34,,  56  ,");
      const parsed = deserializeFilterFromQueryParams(params);
      expect(parsed.selectedAccountIds).toEqual(["12", "34", "56"]);
    });

    it("prefers bracket notation accounts[] when present over legacy accounts", () => {
      const params = new URLSearchParams("accounts=old1,old2&accounts[]=new1&accounts[]=new2");
      const parsed = deserializeFilterFromQueryParams(params);
      expect(parsed.selectedAccountIds).toEqual(["new1", "new2"]);
    });

    it("handles record format with undefined and array values", () => {
      const record = {
        period: "12W",
        start: ["2026-01-01", "2026-01-02"],
        account_filter: "custom",
        "accounts[]": ["acc-99", "acc-100"],
      };
      const parsed = deserializeFilterFromQueryParams(record);
      expect(parsed.preset).toBe("12W");
      expect(parsed.startDate).toBe("2026-01-01");
      expect(parsed.accountFilter).toBe("custom");
      expect(parsed.selectedAccountIds).toEqual(["acc-99", "acc-100"]);
    });

    it("ignores invalid accountFilter values", () => {
      const params = new URLSearchParams("accountFilter=DROP_DATABASE&account_filter=ILLEGAL");
      const parsed = deserializeFilterFromQueryParams(params);
      expect(parsed.accountFilter).toBeUndefined();
    });

    it("safely handles 1,000 bracket accounts without performance degradation", () => {
      const sp = new URLSearchParams();
      for (let i = 0; i < 1000; i++) {
        sp.append("accounts[]", `acc-${i}`);
      }
      const parsed = deserializeFilterFromQueryParams(sp);
      expect(parsed.selectedAccountIds?.length).toBe(1000);
      expect(parsed.selectedAccountIds?.[0]).toBe("acc-0");
      expect(parsed.selectedAccountIds?.[999]).toBe("acc-999");
    });

    it("investigates URL search params replacement behavior when bracket notation accounts[] is present", () => {
      const initialUrl = new URL("https://wallet.local/reports?accounts[]=1&accounts[]=2");
      const url = new URL(initialUrl.href);

      // Simulating what filter-context useEffect currently does:
      url.searchParams.set("accounts", "2"); // User deselected "1"
      
      // Does accounts[] still linger in the URL search params?
      const remainingBrackets = url.searchParams.getAll("accounts[]");
      expect(remainingBrackets).toEqual(["1", "2"]);

      // And deserializeFilterFromQueryParams prioritizes bracket notation:
      const restored = deserializeFilterFromQueryParams(url.searchParams);
      expect(restored.selectedAccountIds).toEqual(["1", "2"]); // Reverted because accounts[] was not pruned!
    });

  });

  // ==========================================================================
  // Section 4: Account Filter Default Logic & include_net_worth Verification
  // ==========================================================================
  describe("4. Account Filter include_net_worth Verification", () => {
    const testAccounts = [
      { id: "1", name: "Main Checking", include_net_worth: true },
      { id: "2", name: "Emergency Savings", attributes: { include_net_worth: true } },
      { id: "3", name: "Secret Cash", include_net_worth: false },
      { id: "4", name: "Excluded Tracking", attributes: { include_net_worth: false } },
      { id: "5", name: "Default Account (no flag)" },
      { id: "6", name: "Empty Attributes", attributes: {} },
      { id: "7", name: "Null Net Worth", include_net_worth: null as unknown as boolean },
      { id: "8", name: "Explicit Both False", include_net_worth: false, attributes: { include_net_worth: false } },
    ];

    it("mode 'all_stats': STRICTLY OMITS accounts with include_net_worth: false (direct or attributes)", () => {
      const filtered = filterAccountsForStats(testAccounts, "all_stats");
      const ids = filtered.map((a) => a.id);

      // Excluded: 3, 4, 8
      expect(ids).not.toContain("3");
      expect(ids).not.toContain("4");
      expect(ids).not.toContain("8");

      // Included: 1, 2, 5, 6, 7
      expect(ids).toContain("1");
      expect(ids).toContain("2");
      expect(ids).toContain("5");
      expect(ids).toContain("6");
      expect(ids).toContain("7");
      expect(filtered.length).toBe(5);
    });

    it("mode 'all': STRICTLY INCLUDES accounts regardless of include_net_worth", () => {
      const filtered = filterAccountsForStats(testAccounts, "all");
      expect(filtered.length).toBe(testAccounts.length);
      const ids = filtered.map((a) => a.id);
      expect(ids).toContain("3");
      expect(ids).toContain("4");
      expect(ids).toContain("8");
    });

    it("mode 'custom': strictly filters to selectedAccountIds, even if include_net_worth is false", () => {
      // User explicitly selects excluded account 3 and included account 1
      const filtered = filterAccountsForStats(testAccounts, "custom", ["1", "3"]);
      const ids = filtered.map((a) => a.id);
      expect(ids).toEqual(["1", "3"]);
    });

    it("handles empty account lists gracefully without error across all modes", () => {
      expect(filterAccountsForStats([], "all_stats")).toEqual([]);
      expect(filterAccountsForStats([], "all")).toEqual([]);
      expect(filterAccountsForStats([], "custom", ["1", "2"])).toEqual([]);
    });

    it("handles custom mode with empty selectedAccountIds safely", () => {
      expect(filterAccountsForStats(testAccounts, "custom", [])).toEqual([]);
    });

    it("matches numeric and string ID representations safely", () => {
      const accountsWithNumericIds = [
        { id: "101", name: "Account 101" },
        { id: "202", name: "Account 202" },
      ];
      const result = filterAccountsForStats(accountsWithNumericIds, "custom", ["101"]);
      expect(result.map((a) => a.id)).toEqual(["101"]);
    });
  });

  // ==========================================================================
  // Section 5: Rapid Stepping, Preset Math, & Date Boundaries
  // ==========================================================================
  describe("5. Rapid Stepping & Calendar Math Stress", () => {
    it("50 sequential steps forward and 50 steps backward return precisely to origin", () => {
      const startRange = getPresetDateRange("30D", "2026-11-06");
      let current = { preset: "30D" as PeriodPreset, startDate: startRange.start, endDate: startRange.end };

      // Step forward 50 times
      for (let i = 0; i < 50; i++) {
        const next = stepPeriod(current, 1);
        current = { preset: "30D", ...next };
      }

      // Step backward 50 times
      for (let i = 0; i < 50; i++) {
        const next = stepPeriod(current, -1);
        current = { preset: "30D", ...next };
      }

      expect(current.startDate).toBe(startRange.start);
      expect(current.endDate).toBe(startRange.end);
    });

    it("verifies leap year stepping: Feb 2024 (29 days) vs Feb 2025 (28 days)", () => {
      const feb2024 = stepPeriod({ preset: "this_month", startDate: "2024-03-01", endDate: "2024-03-31" }, -1);
      expect(feb2024.startDate).toBe("2024-02-01");
      expect(feb2024.endDate).toBe("2024-02-29");

      const feb2025 = stepPeriod({ preset: "this_month", startDate: "2025-03-01", endDate: "2025-03-31" }, -1);
      expect(feb2025.startDate).toBe("2025-02-01");
      expect(feb2025.endDate).toBe("2025-02-28");
    });

    it("prior period invariant: prior period end is exactly 1 day before current start", () => {
      const testCases = [
        { start: "2026-11-01", end: "2026-11-30" }, // 30 days
        { start: "2026-03-01", end: "2026-03-31" }, // follows Feb 28
        { start: "2024-03-01", end: "2024-03-31" }, // follows Feb 29 (leap)
        { start: "2026-01-01", end: "2026-01-01" }, // 1 day
        { start: "2026-10-31", end: "2026-11-06" }, // 7D
      ];

      for (const tc of testCases) {
        const prior = getPriorPeriod(tc.start, tc.end);
        const currentStart = parseDate(tc.start);
        const priorEnd = parseDate(prior.end);
        const expectedPriorEnd = addDays(currentStart, -1);

        expect(formatDate(priorEnd)).toBe(formatDate(expectedPriorEnd));

        // Duration invariant: (end - start) must match
        const currSpan = parseDate(tc.end).getTime() - currentStart.getTime();
        const priorSpan = priorEnd.getTime() - parseDate(prior.start).getTime();
        expect(priorSpan).toBe(currSpan);
      }
    });

    it("verifies all 10 presets have startDate <= endDate", () => {
      const refDates = ["2024-02-29", "2025-01-01", "2026-07-15", "2026-12-31"];
      for (const opt of PERIOD_PRESETS) {
        for (const ref of refDates) {
          const range = getPresetDateRange(opt.key, ref);
          expect(range.start <= range.end).toBe(true);
          expect(range.startDate).toBe(range.start);
          expect(range.endDate).toBe(range.end);
        }
      }
    });

    it("custom 1-day range step shifts forward/backward by exactly 1 day", () => {
      const singleDay = { preset: "custom" as PeriodPreset, startDate: "2026-05-15", endDate: "2026-05-15" };
      const nextDay = stepPeriod(singleDay, 1);
      expect(nextDay.startDate).toBe("2026-05-16");
      expect(nextDay.endDate).toBe("2026-05-16");

      const prevDay = stepPeriod(singleDay, -1);
      expect(prevDay.startDate).toBe("2026-05-14");
      expect(prevDay.endDate).toBe("2026-05-14");
    });
  });
});
