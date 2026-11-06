import { describe, expect, it } from "vitest";
import {
  evaluateCalcExpression,
  applyDenominationChip,
  tokenizeMathExpression,
} from "@/app/(app)/new/new-transaction";
import {
  buildSearchQuery,
  filtersFromParams,
  EMPTY_FILTERS,
  type Filters,
} from "@/app/(app)/transactions/transactions-client";

describe("Milestone 2 & 3 Adversarial Challenge & Stress Tests (Challenger 1)", () => {
  // ==========================================================================
  // Section 1: Milestone 3 — Compound PEMDAS Arithmetic
  // ==========================================================================
  describe("1. PEMDAS Operator Precedence & Compound Expressions", () => {
    it("1.1: multiplication precedes addition regardless of order", () => {
      // 150 + 25 * 3 must NOT be (150+25)*3 = 525
      expect(evaluateCalcExpression("150 + 25 * 3")).toBe("225");
      // Reversed order
      expect(evaluateCalcExpression("25 * 3 + 150")).toBe("225");
    });

    it("1.2: division precedes subtraction regardless of order", () => {
      expect(evaluateCalcExpression("100 - 40 / 2")).toBe("80");
      expect(evaluateCalcExpression("40 / 2 - 100")).toBe("0"); // negative clamped to 0
    });

    it("1.3: mixed compound expression with all 4 operations", () => {
      // 10 + 20 * 3 - 40 / 4 = 10 + 60 - 10 = 60
      expect(evaluateCalcExpression("10 + 20 * 3 - 40 / 4")).toBe("60");
      // 100 / 4 * 2 + 50 - 30 = (25 * 2) + 50 - 30 = 70
      expect(evaluateCalcExpression("100 / 4 * 2 + 50 - 30")).toBe("70");
    });

    it("1.4: strict left-to-right evaluation for operators of equal precedence", () => {
      // 120 / 3 / 2 / 2 = ((120 / 3) / 2) / 2 = 10
      expect(evaluateCalcExpression("120 / 3 / 2 / 2")).toBe("10");
      // 100 - 20 - 30 - 10 = 40
      expect(evaluateCalcExpression("100 - 20 - 30 - 10")).toBe("40");
      // 100 / 5 * 2 = 20 * 2 = 40
      expect(evaluateCalcExpression("100 / 5 * 2")).toBe("40");
    });

    it("1.5: compound decimal arithmetic with precise fractions", () => {
      // 12.5 * 4.2 + 8.75 / 2.5 - 1.5 = 52.5 + 3.5 - 1.5 = 54.5
      expect(evaluateCalcExpression("12.5 * 4.2 + 8.75 / 2.5 - 1.5")).toBe("54.5");
    });

    it("1.6: zero multipliers and additions", () => {
      expect(evaluateCalcExpression("0 * 50 + 10 * 0 + 25")).toBe("25");
      expect(evaluateCalcExpression("50 * 0 * 100")).toBe("0");
    });
  });

  // ==========================================================================
  // Section 2: Milestone 3 — Deeply Nested & Malformed Parentheses
  // ==========================================================================
  describe("2. Deeply Nested & Malformed Parentheses", () => {
    it("2.1: 5-level nested parentheses evaluate from innermost outwards", () => {
      // (((((10 + 20) * 2) - 10) / 5) + 3)
      // 10+20 = 30 -> *2 = 60 -> -10 = 50 -> /5 = 10 -> +3 = 13
      expect(evaluateCalcExpression("(((((10 + 20) * 2) - 10) / 5) + 3)")).toBe("13");
    });

    it("2.2: multiple sibling parenthesized subexpressions", () => {
      // (10 + 20) * (30 - 15) / (2 + 3) = 30 * 15 / 5 = 450 / 5 = 90
      expect(evaluateCalcExpression("(10 + 20) * (30 - 15) / (2 + 3)")).toBe("90");
    });

    it("2.3: parenthesized addition overrides multiplication precedence", () => {
      expect(evaluateCalcExpression("(150 + 25) * 3")).toBe("525");
      expect(evaluateCalcExpression("100 - (20 + 30) * 2")).toBe("0"); // 100 - 100 = 0
    });

    it("2.4: unclosed opening parentheses recover safely", () => {
      // User typed "((10 + 20 * 3" without closing
      expect(evaluateCalcExpression("((10 + 20 * 3")).toBe("70");
      expect(evaluateCalcExpression("(150 + 25")).toBe("175");
    });

    it("2.5: redundant closing parentheses do not throw uncaught errors", () => {
      expect(evaluateCalcExpression("(10 + 20)) * 2")).toBe("60");
      expect(evaluateCalcExpression("10 + 5)))")).toBe("15");
    });

    it("2.6: empty and redundant parentheses", () => {
      expect(evaluateCalcExpression("10 + () + 20")).toBe("30");
      expect(evaluateCalcExpression("((50))")).toBe("50");
    });

    it("2.7: trailing open parenthesis while user is typing", () => {
      expect(evaluateCalcExpression("50 + (")).toBe("50");
    });
  });

  // ==========================================================================
  // Section 3: Milestone 3 — Division by Zero Robustness
  // ==========================================================================
  describe("3. Division by Zero Edge Cases", () => {
    it("3.1: direct division by zero returns 0 without crashing", () => {
      expect(evaluateCalcExpression("100 / 0")).toBe("0");
    });

    it("3.2: compound expression with division by zero isolates the zeroed term", () => {
      // 50 + 100 / 0 = 50 + 0 = 50
      expect(evaluateCalcExpression("50 + 100 / 0")).toBe("50");
    });

    it("3.3: dynamic zero denominator in subexpression", () => {
      // 100 / (10 - 10) = 100 / 0 = 0
      expect(evaluateCalcExpression("100 / (10 - 10)")).toBe("0");
      // 25 + 100 / (5 - 5) * 10 = 25 + 0 * 10 = 25
      expect(evaluateCalcExpression("25 + 100 / (5 - 5) * 10")).toBe("25");
    });

    it("3.4: zero divided by zero yields 0", () => {
      expect(evaluateCalcExpression("0 / 0")).toBe("0");
    });

    it("3.5: multiple consecutive divisions by zero", () => {
      expect(evaluateCalcExpression("100 / 0 / 0 + 25")).toBe("25");
    });
  });

  // ==========================================================================
  // Section 4: Milestone 3 — Negative Numbers & Clamping
  // ==========================================================================
  describe("4. Negative Results & Unary Operators", () => {
    it("4.1: negative results clamp to 0 for financial transaction amounts", () => {
      expect(evaluateCalcExpression("10 - 50")).toBe("0");
      expect(evaluateCalcExpression("(10 - 50) * 2")).toBe("0");
      expect(evaluateCalcExpression("-100")).toBe("0");
    });

    it("4.2: unary minus at start of expression", () => {
      expect(evaluateCalcExpression("-10 + 50")).toBe("40");
      expect(evaluateCalcExpression("-25 * -4")).toBe("100");
    });

    it("4.3: unary minus inside parentheses", () => {
      expect(evaluateCalcExpression("(-25 + 75) * 2")).toBe("100");
    });

    it("4.4: unary minus following binary operator", () => {
      expect(evaluateCalcExpression("50 + -20")).toBe("30");
      expect(evaluateCalcExpression("50 - -20")).toBe("70");
      expect(evaluateCalcExpression("10 * -5")).toBe("0"); // -50 clamped to 0
    });

    it("4.5: unary plus operators are gracefully ignored", () => {
      expect(evaluateCalcExpression("+50 + +25")).toBe("75");
      expect(evaluateCalcExpression("+100")).toBe("100");
    });
  });

  // ==========================================================================
  // Section 5: Milestone 3 — Currency Symbols, Whitespace & Trailing Operators
  // ==========================================================================
  describe("5. Currency Symbols, Whitespace & In-Progress Typing", () => {
    it("5.1: ignores currency symbols and alphanumeric characters cleanly", () => {
      expect(evaluateCalcExpression("$150 + €50")).toBe("200");
      expect(evaluateCalcExpression("£25 * ¥4")).toBe("100");
      expect(evaluateCalcExpression("100 USD + 50 EUR")).toBe("150");
    });

    it("5.2: handles arbitrary whitespace, tabs, and non-breaking spaces", () => {
      expect(evaluateCalcExpression("  \t 150 \u00A0 + \t 50 \u00A0 ")).toBe("200");
    });

    it("5.3: handles trailing operators during live keystroke input", () => {
      expect(evaluateCalcExpression("150 +")).toBe("150");
      expect(evaluateCalcExpression("150 -")).toBe("150");
      expect(evaluateCalcExpression("150 *")).toBe("150");
      expect(evaluateCalcExpression("150 /")).toBe("150");
      expect(evaluateCalcExpression("150 + 25 *")).toBe("175");
    });

    it("5.4: handles empty or non-numeric input gracefully", () => {
      expect(evaluateCalcExpression("")).toBe("0");
      expect(evaluateCalcExpression("    ")).toBe("0");
      expect(evaluateCalcExpression("abc")).toBe("0");
      expect(evaluateCalcExpression("+ - * /")).toBe("0");
    });

    it("5.5: exact decimal precision without IEEE-754 binary floating drift", () => {
      expect(evaluateCalcExpression("0.1 + 0.2")).toBe("0.3");
      expect(evaluateCalcExpression("0.3 - 0.1")).toBe("0.2");
      expect(evaluateCalcExpression("0.05 + 0.05")).toBe("0.1");
    });
  });

  // ==========================================================================
  // Section 6: Milestone 3 — Denomination Chips & Tokenizer
  // ==========================================================================
  describe("6. Quick Denomination Chips & Tokenizer", () => {
    it("6.1: applies denomination chips to static values", () => {
      expect(applyDenominationChip("0", 10)).toBe("10");
      expect(applyDenominationChip("100", 50)).toBe("150");
      expect(applyDenominationChip("250.50", 100)).toBe("350.5");
    });

    it("6.2: evaluates active formula before adding denomination chip", () => {
      // Current expression is "150 + 25 * 3" (= 225), user clicks +50 chip
      expect(applyDenominationChip("150 + 25 * 3", 50)).toBe("275");
    });

    it("6.3: handles trailing operator in expression before applying chip", () => {
      // Current expression is "100 +", user clicks +50 chip
      expect(applyDenominationChip("100 +", 50)).toBe("150");
    });

    it("6.4: negative delta clamps to 0", () => {
      expect(applyDenominationChip("20", -50)).toBe("0");
    });

    it("6.5: cumulative chain of denomination chips", () => {
      let val = "0";
      val = applyDenominationChip(val, 100);
      val = applyDenominationChip(val, 50);
      val = applyDenominationChip(val, 10);
      val = applyDenominationChip(val, 10);
      expect(val).toBe("170");
    });

    it("6.6: tokenizeMathExpression structured token extraction and skipping", () => {
      const tokens = tokenizeMathExpression("150 + (-25 * 3)");
      expect(tokens.length).toBe(7);
      expect(tokens[0]).toEqual({ type: "number", value: expect.anything() });
      expect(tokens[1]).toEqual({ type: "operator", op: "+" });
      expect(tokens[2]).toEqual({ type: "left_paren" });
      expect(tokens[3]).toEqual({ type: "number", value: expect.anything() });
      expect(tokens[4]).toEqual({ type: "operator", op: "*" });
      expect(tokens[5]).toEqual({ type: "number", value: expect.anything() });
      expect(tokens[6]).toEqual({ type: "right_paren" });

      expect(tokenizeMathExpression("")).toEqual([]);
      expect(tokenizeMathExpression("abc")).toEqual([]);
    });
  });

  // ==========================================================================
  // Section 7: Milestone 2 — Transactions Client Query Sync
  // ==========================================================================
  describe("7. Transactions Client Query Parameter Sync & Filtering", () => {
    it("7.1: filtersFromParams correctly parses search params", () => {
      const sp = new URLSearchParams(
        "type=withdrawal&query=supermarket&category=Groceries&accountId=4&tag=weekly&budget=Food",
      );
      const f = filtersFromParams((k) => sp.get(k));
      expect(f.type).toBe("withdrawal");
      expect(f.text).toBe("supermarket");
      expect(f.category).toBe("Groceries");
      expect(f.accountId).toBe("4");
      expect(f.tag).toBe("weekly");
      expect(f.budget).toBe("Food");
    });

    it("7.2: buildSearchQuery combines local filters with universal date range", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        type: "withdrawal",
        category: "Entertainment",
        text: "cinema",
      };
      const query = buildSearchQuery(f, {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      });
      expect(query).toBe(
        "type:withdrawal category_is:Entertainment date_after:2026-11-01 date_before:2026-11-30 cinema",
      );
    });

    it("7.3: custom multi-account universal filter generates boolean OR group", () => {
      const f: Filters = { ...EMPTY_FILTERS };
      const query = buildSearchQuery(f, {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        accountFilter: "custom",
        selectedAccountIds: ["1", "3", "7"],
      });
      expect(query).toBe(
        "(account_id:1 OR account_id:3 OR account_id:7) date_after:2026-11-01 date_before:2026-11-30",
      );
    });

    it("7.4: custom single account universal filter generates single account_id without parentheses", () => {
      const f: Filters = { ...EMPTY_FILTERS };
      const query = buildSearchQuery(f, {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        accountFilter: "custom",
        selectedAccountIds: ["5"],
      });
      expect(query).toBe("account_id:5 date_after:2026-11-01 date_before:2026-11-30");
    });

    it("7.5: local accountId filter overrides universal custom accounts", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        accountId: "99",
      };
      const query = buildSearchQuery(f, {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        accountFilter: "custom",
        selectedAccountIds: ["1", "2"],
      });
      expect(query).toBe("account_id:99 date_after:2026-11-01 date_before:2026-11-30");
    });

    it("7.6: local date bounds override universal date range", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        dateAfter: "2026-10-15",
        dateBefore: "2026-10-20",
      };
      const query = buildSearchQuery(f, {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      });
      expect(query).toBe("date_after:2026-10-15 date_before:2026-10-20");
    });

    it("7.7: quotes multi-word categories and budgets", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        category: "Food & Drinks",
        budget: "Holiday 2026",
      };
      const query = buildSearchQuery(f);
      expect(query).toBe('category_is:"Food & Drinks" budget_is:"Holiday 2026"');
    });

    it("7.8: net-worth excluded transaction filtering logic simulation", () => {
      const excludedAccountIds = new Set(["99"]);

      const transactions = [
        // tx1: regular expense from account 1 (asset) to payee -> KEEP
        {
          id: "tx1",
          attributes: {
            transactions: [{ source_id: "1", destination_id: "payee" }],
          },
        },
        // tx2: expense from excluded account 99 -> FILTER OUT
        {
          id: "tx2",
          attributes: {
            transactions: [{ source_id: "99", destination_id: "payee" }],
          },
        },
        // tx3: transfer from account 1 to account 2 (both included) -> KEEP
        {
          id: "tx3",
          attributes: {
            transactions: [{ source_id: "1", destination_id: "2" }],
          },
        },
      ];

      // Simulated filtering logic from transactions-client.tsx lines 205-222:
      const filtered = transactions.filter((g) => {
        const splits = g.attributes.transactions;
        if (!splits || splits.length === 0) return true;
        const allExcluded = splits.every(
          (s) =>
            (s.source_id && excludedAccountIds.has(s.source_id)) ||
            (s.destination_id && excludedAccountIds.has(s.destination_id)),
        );
        return !allExcluded;
      });

      expect(filtered.map((t) => t.id)).toEqual(["tx1", "tx3"]);
    });
  });

  // ==========================================================================
  // Section 8: Fuzzing, Generators & Oracle Stress Tests
  // ==========================================================================
  describe("8. Fuzzing, Generators & Adversarial Oracle Verification", () => {
    it("8.1: generator oracle compares 50 random PEMDAS expressions against direct calculation", () => {
      for (let i = 0; i < 50; i++) {
        const a = (i * 7 + 13) % 50 + 1;
        const b = (i * 11 + 17) % 30 + 1;
        const c = (i * 13 + 19) % 20 + 1;
        const d = (i * 17 + 23) % 15 + 1;

        // Template 1
        expect(evaluateCalcExpression(`${a} + ${b} * ${c}`)).toBe(String(a + b * c));
        // Template 2
        expect(evaluateCalcExpression(`(${a} + ${b}) * ${c}`)).toBe(String((a + b) * c));
        // Template 3
        expect(evaluateCalcExpression(`${a} * ${b} + ${c} * ${d}`)).toBe(String(a * b + c * d));
        // Template 4
        expect(evaluateCalcExpression(`(${a} + ${b}) * (${c} + ${d})`)).toBe(
          String((a + b) * (c + d)),
        );
        // Template 5
        const t5Expected = Math.max(0, a * (b + c) - d);
        expect(evaluateCalcExpression(`${a} * (${b} + ${c}) - ${d}`)).toBe(String(t5Expected));
      }
    });

    it("8.2: 50 levels of deeply nested parentheses", () => {
      const expr = "(".repeat(50) + "42" + ")".repeat(50);
      expect(evaluateCalcExpression(expr)).toBe("42");
    });

    it("8.3: massive expression with 100 additions", () => {
      const expr = "1" + " + 1".repeat(100);
      expect(evaluateCalcExpression(expr)).toBe("101");
    });

    it("8.4: pathological consecutive operators recover safely without crashing", () => {
      expect(evaluateCalcExpression("10 ++ 5")).toBe("15");
      expect(evaluateCalcExpression("10 +- 5")).toBe("5");
      expect(evaluateCalcExpression("10 -+ 5")).toBe("5");
      expect(evaluateCalcExpression("10 -- 5")).toBe("15");
      expect(evaluateCalcExpression("10 *** 5")).toBe("50");
      expect(evaluateCalcExpression("100 /// 10")).toBe("10");
    });

    it("8.5: random garbage and injection strings never throw and return string numeric or 0", () => {
      const adversarialStrings = [
        '<script>alert("xss")</script>',
        "' OR 1=1 --",
        "NaN",
        "Infinity",
        "-Infinity",
        "undefined",
        "null",
        "{}",
        "[]",
        "eval('2+2')",
        "process.exit(1)",
        "!@#$%^&*()_+{}|:\"<>?~`-=[]\\;',./",
        "🦝💸💰🔥🚀",
        "\x00\x01\x02\x03\x04",
      ];

      for (const s of adversarialStrings) {
        expect(() => {
          const res = evaluateCalcExpression(s);
          expect(typeof res).toBe("string");
          expect(!isNaN(Number(res))).toBe(true);
        }).not.toThrow();
      }
    });

    it("8.6: universal filter query sync handles special characters and quotes", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        category: 'Food "Gourmet" Groceries',
        tag: "summer trip 2026",
      };
      const query = buildSearchQuery(f, {
        startDate: "2026-06-01",
        endDate: "2026-08-31",
      });
      expect(query).toBe(
        'category_is:"Food Gourmet Groceries" tag_is:"summer trip 2026" date_after:2026-06-01 date_before:2026-08-31',
      );
    });

    it("8.7: empty universal scope is identical to omitting universal parameter", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        type: "deposit",
        text: "payroll",
      };
      expect(buildSearchQuery(f, {})).toBe(buildSearchQuery(f));
    });
  });
});
