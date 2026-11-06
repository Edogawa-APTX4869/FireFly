import { describe, expect, it } from "vitest";
import {
  evaluateMathExpression,
  applyDenominationChip,
  tokenizeMathExpression,
} from "./test-harness";

describe("Desktop PEMDAS Math Evaluator (Tiers 1-3)", () => {
  // ==========================================================================
  // Tier 1: Feature Coverage (Primary Path Contracts)
  // ==========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: evaluates multiplication before addition following PEMDAS (150 + 25 * 3 = 225)", () => {
      // Primary requirement: must NOT be 525 (the naive left-to-right bug)
      const result = evaluateMathExpression("150 + 25 * 3");
      expect(result).toBe("225");
    });

    it("T1.2: evaluates division before subtraction following PEMDAS (100 - 40 / 2 = 80)", () => {
      const result = evaluateMathExpression("100 - 40 / 2");
      expect(result).toBe("80");
    });

    it("T1.3: evaluates parentheses first to override default precedence ((150 + 25) * 3 = 525)", () => {
      const result = evaluateMathExpression("(150 + 25) * 3");
      expect(result).toBe("525");
    });

    it("T1.4: evaluates operators of same precedence left-to-right (100 - 30 - 20 = 50)", () => {
      expect(evaluateMathExpression("100 - 30 - 20")).toBe("50");
      expect(evaluateMathExpression("100 / 5 * 2")).toBe("40");
    });

    it("T1.5: calculates decimal arithmetic with precision (10.5 * 2.2 + 0.9 = 24)", () => {
      const result = evaluateMathExpression("10.5 * 2.2 + 0.9");
      expect(result).toBe("24");
    });

    it("T1.6: supports leading decimal points (.5 + .25 * 2 = 1)", () => {
      const result = evaluateMathExpression(".5 + .25 * 2");
      expect(result).toBe("1");
    });

    it("T1.7: handles arbitrary whitespace around operators and numbers", () => {
      expect(evaluateMathExpression("  150   +   25   *   3  ")).toBe("225");
      expect(evaluateMathExpression("10+20*3")).toBe("70");
    });

    it("T1.8: applies quick denomination chips (+10, +50, +100) correctly", () => {
      expect(applyDenominationChip("0", 10)).toBe("10");
      expect(applyDenominationChip("100", 50)).toBe("150");
      expect(applyDenominationChip("250.50", 100)).toBe("350.5");
    });

    it("T1.9: clamps negative results to 0 for transaction amount inputs", () => {
      expect(evaluateMathExpression("50 - 100")).toBe("0");
      expect(evaluateMathExpression("10 - 20 * 5")).toBe("0");
    });
  });

  // ==========================================================================
  // Tier 2: Boundary & Corner Cases (Robustness & Edge Conditions)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: handles division by zero gracefully without throwing uncaught errors", () => {
      const result = evaluateMathExpression("100 / 0");
      expect(result).toBe("0");

      const withAdd = evaluateMathExpression("50 + 100 / 0");
      expect(withAdd).toBe("50");
    });

    it("T2.2: handles typing in progress with trailing operators", () => {
      // When user types "150 +", it evaluates the valid prefix 150
      expect(evaluateMathExpression("150 +")).toBe("150");
      expect(evaluateMathExpression("150 *")).toBe("150");
      expect(evaluateMathExpression("150 -")).toBe("150");
      expect(evaluateMathExpression("150 /")).toBe("150");
    });

    it("T2.3: handles unclosed parentheses gracefully", () => {
      // User typed "(150 + 25 * 3" without closing ')'
      const result = evaluateMathExpression("(150 + 25 * 3");
      expect(result).toBe("225");
    });

    it("T2.4: returns 0 for empty or whitespace-only inputs", () => {
      expect(evaluateMathExpression("")).toBe("0");
      expect(evaluateMathExpression("   ")).toBe("0");
    });

    it("T2.5: handles unary minus at beginning and mid-expression", () => {
      expect(evaluateMathExpression("-10 + 50")).toBe("40");
      expect(evaluateMathExpression("50 + -10")).toBe("40");
    });

    it("T2.6: strips non-mathematical currency symbols and letters cleanly", () => {
      expect(evaluateMathExpression("$150 + €50")).toBe("200");
      expect(evaluateMathExpression("abc")).toBe("0");
    });

    it("T2.7: prevents floating point binary drift (0.1 + 0.2 equals 0.3 exactly)", () => {
      // In standard JS: 0.1 + 0.2 = 0.30000000000000004
      const result = evaluateMathExpression("0.1 + 0.2");
      expect(result).toBe("0.3");
    });

    it("T2.8: calculates large monetary figures without overflow or exponent notation", () => {
      const result = evaluateMathExpression("1000000.50 * 5 + 250000");
      expect(result).toBe("5250002.5");
    });

    it("T2.9: tokenizer creates structured token stream", () => {
      const tokens = tokenizeMathExpression("150 + 25 * 3");
      expect(tokens.length).toBe(5);
      expect(tokens[0]).toEqual({ type: "number", value: expect.anything() });
      expect(tokens[1]).toEqual({ type: "operator", op: "+" });
      expect(tokens[2]).toEqual({ type: "number", value: expect.anything() });
      expect(tokens[3]).toEqual({ type: "operator", op: "*" });
      expect(tokens[4]).toEqual({ type: "number", value: expect.anything() });
    });
  });

  // ==========================================================================
  // Tier 3: Cross-Feature Combinations (Pairwise Interoperability)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: evaluates deeply nested multi-level parentheses (((100 + 50) * 2 - 50) / 5 = 50)", () => {
      const result = evaluateMathExpression("(((100 + 50) * 2 - 50) / 5)");
      expect(result).toBe("50");
    });

    it("T3.2: chains denomination chip after math expression evaluation", () => {
      // User entered "150 + 25 * 3", evaluated to 225, then clicks "+50" chip
      const evaluated = evaluateMathExpression("150 + 25 * 3");
      expect(evaluated).toBe("225");

      const chipped = applyDenominationChip(evaluated, 50);
      expect(chipped).toBe("275");

      const chippedAgain = applyDenominationChip(chipped, 10);
      expect(chippedAgain).toBe("285");
    });

    it("T3.3: simulates keystroke-by-keystroke live evaluation without crashing", () => {
      const keystrokes = [
        "1",
        "15",
        "150",
        "150 ",
        "150 +",
        "150 + ",
        "150 + 2",
        "150 + 25",
        "150 + 25 ",
        "150 + 25 *",
        "150 + 25 * ",
        "150 + 25 * 3",
      ];

      const expected = [
        "1",
        "15",
        "150",
        "150",
        "150", // trailing + ignored, evaluates 150
        "150",
        "152", // 150 + 2
        "175", // 150 + 25
        "175",
        "175", // trailing * ignored, evaluates 150 + 25
        "175",
        "225", // 150 + 25 * 3 = 225
      ];

      keystrokes.forEach((keystroke, idx) => {
        expect(evaluateMathExpression(keystroke)).toBe(expected[idx]);
      });
    });

    it("T3.4: calculates live currency tax/rate inline multiplier", () => {
      // E.g., Item price 120 with 8.5% sales tax plus 15 shipping: 120 * 1.085 + 15
      const result = evaluateMathExpression("120 * 1.085 + 15");
      expect(result).toBe("145.2");
    });

    it("T3.5: sequential denomination clicks build up cumulative amount", () => {
      let current = "0";
      current = applyDenominationChip(current, 100);
      current = applyDenominationChip(current, 100);
      current = applyDenominationChip(current, 50);
      current = applyDenominationChip(current, 10);
      expect(current).toBe("260");
    });
  });
});
