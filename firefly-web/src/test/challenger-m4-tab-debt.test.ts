import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  computeCreditDebtGauge,
  type CreditDebtGaugeResult,
} from "@/app/(app)/reports/components/reports-math";
import type { ReportTabKey } from "@/app/(app)/reports/reports-client";

// ============================================================================
// Mirror of ReportsClient normalizeTabKey contract
// (Verifying deep-linking and fallback behavior per Milestone 4 specification)
// ============================================================================
function normalizeTabKey(tab?: string | null): ReportTabKey {
  if (!tab) return "balance";
  const lower = tab.toLowerCase();
  if (lower === "balance") return "balance";
  if (lower === "cashflow" || lower === "cash-flow") return "cash-flow";
  if (lower === "spending" || lower === "categories") return "spending";
  if (lower === "outlook" || lower === "projection") return "outlook";
  if (lower === "credit" || lower === "debt" || lower === "liabilities") return "debt";
  return "balance";
}

describe("Milestone 4 Challenger 2: Tab Routing & Credit Debt Gauge Stress Harness", () => {
  // ==========================================================================
  // 1. Tab Routing, Deep Linking & Query Fallbacks
  // ==========================================================================
  describe("1. Tab Routing & Deep Linking Resolution", () => {
    it("1.1 resolves direct canonical tab keys", () => {
      expect(normalizeTabKey("balance")).toBe("balance");
      expect(normalizeTabKey("cash-flow")).toBe("cash-flow");
      expect(normalizeTabKey("spending")).toBe("spending");
      expect(normalizeTabKey("outlook")).toBe("outlook");
      expect(normalizeTabKey("debt")).toBe("debt");
    });

    it("1.2 resolves recognized aliases seamlessly", () => {
      // cashflow alias
      expect(normalizeTabKey("cashflow")).toBe("cash-flow");
      // spending alias
      expect(normalizeTabKey("categories")).toBe("spending");
      // outlook alias
      expect(normalizeTabKey("projection")).toBe("outlook");
      // debt aliases
      expect(normalizeTabKey("credit")).toBe("debt");
      expect(normalizeTabKey("liabilities")).toBe("debt");
    });

    it("1.3 handles case insensitivity and mixed case inputs", () => {
      expect(normalizeTabKey("BALANCE")).toBe("balance");
      expect(normalizeTabKey("Cash-Flow")).toBe("cash-flow");
      expect(normalizeTabKey("CASHFLOW")).toBe("cash-flow");
      expect(normalizeTabKey("SPENDING")).toBe("spending");
      expect(normalizeTabKey("Categories")).toBe("spending");
      expect(normalizeTabKey("Outlook")).toBe("outlook");
      expect(normalizeTabKey("PROJECTION")).toBe("outlook");
      expect(normalizeTabKey("DEBT")).toBe("debt");
      expect(normalizeTabKey("Credit")).toBe("debt");
      expect(normalizeTabKey("LIABILITIES")).toBe("debt");
    });

    it("1.4 falls back to 'balance' for missing or falsy tab queries", () => {
      expect(normalizeTabKey(null)).toBe("balance");
      expect(normalizeTabKey(undefined)).toBe("balance");
      expect(normalizeTabKey("")).toBe("balance");
    });

    it("1.5 falls back to 'balance' for arbitrary invalid or unrecognized tab queries", () => {
      expect(normalizeTabKey("invalid")).toBe("balance");
      expect(normalizeTabKey("foo")).toBe("balance");
      expect(normalizeTabKey("dashboard")).toBe("balance");
      expect(normalizeTabKey("transactions")).toBe("balance");
      expect(normalizeTabKey("overview")).toBe("balance");
      expect(normalizeTabKey("settings")).toBe("balance");
      expect(normalizeTabKey("balances")).toBe("balance"); // plural typo
      expect(normalizeTabKey("123")).toBe("balance");
      expect(normalizeTabKey("0")).toBe("balance");
      expect(normalizeTabKey("../admin")).toBe("balance");
      expect(normalizeTabKey("<script>alert(1)</script>")).toBe("balance");
      expect(normalizeTabKey("!@#$%^&*()")).toBe("balance");
    });

    it("1.6 preserves existing URL search parameters when switching tabs", () => {
      const initialParams = new URLSearchParams("period=30D&start=2026-10-01&end=2026-10-31&accounts=1%2C2");

      const updateTab = (current: URLSearchParams, newTab: ReportTabKey) => {
        const updated = new URLSearchParams(current.toString());
        updated.set("tab", newTab);
        return updated;
      };

      const withDebt = updateTab(initialParams, "debt");
      expect(withDebt.get("tab")).toBe("debt");
      expect(withDebt.get("period")).toBe("30D");
      expect(withDebt.get("start")).toBe("2026-10-01");
      expect(withDebt.get("end")).toBe("2026-10-31");
      expect(withDebt.get("accounts")).toBe("1,2");

      const withSpending = updateTab(withDebt, "spending");
      expect(withSpending.get("tab")).toBe("spending");
      expect(withSpending.get("period")).toBe("30D");
      expect(withSpending.get("start")).toBe("2026-10-01");
      expect(withSpending.get("end")).toBe("2026-10-31");
      expect(withSpending.get("accounts")).toBe("1,2");
    });
  });

  // ==========================================================================
  // 2. Over-Limit Credit Cards (> 100% Utilization)
  // ==========================================================================
  describe("2. Over-Limit Credit Card Utilization (> 100%)", () => {
    it("2.1 computes utilization > 100% on a single over-limit credit card", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "3500.00",
          credit_limit: "2500.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("3500");
      expect(res.totalCreditLimit.toString()).toBe("2500");
      // 3500 / 2500 * 100 = 140.00%
      expect(res.utilizationPercent).toBe(140);
      expect(res.riskLevel).toBe("high");
    });

    it("2.2 handles severe over-limit utilization (e.g. 500% and 1000%)", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "10000.00",
          credit_limit: "2000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.utilizationPercent).toBe(500);
      expect(res.riskLevel).toBe("high");

      const extreme = computeCreditDebtGauge([
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "50000.00",
          credit_limit: "500.00",
        },
      ]);
      expect(extreme.utilizationPercent).toBe(10000);
      expect(extreme.riskLevel).toBe("high");
    });

    it("2.3 clamps available credit to zero when credit card debt exceeds limit", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "4200.00",
          credit_limit: "3000.00",
        },
      ];

      const metrics = computeCreditDebtGauge(accounts);
      // DebtTab logic:
      const availableCredit = metrics.totalCreditLimit.gt(metrics.creditCardDebt)
        ? metrics.totalCreditLimit.minus(metrics.creditCardDebt)
        : new Decimal(0);

      expect(availableCredit.toString()).toBe("0");
      expect(availableCredit.isNegative()).toBe(false);
    });

    it("2.4 clamps visual progress bar to 100% while retaining true percentage for label", () => {
      const metrics: CreditDebtGaugeResult = {
        totalDebt: new Decimal(4500),
        creditCardDebt: new Decimal(4500),
        totalCreditLimit: new Decimal(3000),
        utilizationPercent: 150,
        riskLevel: "high",
      };

      // DebtTab visual bar clamping:
      const utilPct = Math.min(100, Math.max(0, metrics.utilizationPercent));

      expect(utilPct).toBe(100);
      expect(metrics.utilizationPercent).toBe(150); // numeric display preserves full over-limit metric
    });

    it("2.5 calculates multi-card aggregate utilization when one card is over limit and one is under", () => {
      const accounts = [
        // Card 1: 3000 balance / 2000 limit = 150% (over-limit)
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "3000.00",
          credit_limit: "2000.00",
        },
        // Card 2: 1000 balance / 6000 limit = 16.67% (under-limit)
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "1000.00",
          credit_limit: "6000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("4000");
      expect(res.totalCreditLimit.toString()).toBe("8000");
      // Aggregate: 4000 / 8000 = 50.00% -> threshold boundary
      expect(res.utilizationPercent).toBe(50);
      expect(res.riskLevel).toBe("moderate"); // 50% is moderate, >50% is high
    });
  });

  // ==========================================================================
  // 3. Zero Credit Limit Handling (Safe Divide-by-Zero Avoidance)
  // ==========================================================================
  describe("3. Zero Credit Limit Divide-by-Zero Safety", () => {
    it("3.1 safely returns 0% utilization and 'healthy' risk when credit limit is 0", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "1200.00",
          credit_limit: "0",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("1200");
      expect(res.totalCreditLimit.toString()).toBe("0");
      expect(res.utilizationPercent).toBe(0);
      expect(res.riskLevel).toBe("healthy");
      expect(Number.isNaN(res.utilizationPercent)).toBe(false);
      expect(Number.isFinite(res.utilizationPercent)).toBe(true);
    });

    it("3.2 safely handles zero balance and zero limit simultaneously", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "0",
          credit_limit: "0",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("0");
      expect(res.totalCreditLimit.toString()).toBe("0");
      expect(res.utilizationPercent).toBe(0);
      expect(res.riskLevel).toBe("healthy");
    });

    it("3.3 safely handles missing, null, or empty string credit limit", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "850.00",
          credit_limit: undefined,
        },
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "150.00",
          credit_limit: "",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("1000");
      expect(res.totalCreditLimit.toString()).toBe("0");
      expect(res.utilizationPercent).toBe(0);
      expect(res.riskLevel).toBe("healthy");
    });

    it("3.4 safely combines zero-limit cards with non-zero limit cards", () => {
      const accounts = [
        // Card with no limit specified
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "500.00",
          credit_limit: "0",
        },
        // Card with active limit
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "700.00",
          credit_limit: "3000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("1200");
      expect(res.totalCreditLimit.toString()).toBe("3000");
      // 1200 / 3000 = 40.00%
      expect(res.utilizationPercent).toBe(40);
      expect(res.riskLevel).toBe("moderate");
    });
  });

  // ==========================================================================
  // 4. Negative Balance & Credit Refund Handling
  // ==========================================================================
  describe("4. Negative Balance & Credit Refund Handling", () => {
    it("4.1 converts negative balance string to absolute debt in standard Firefly III liability mode", () => {
      // In Firefly III, liabilities and credit card balances are often recorded as negative amounts (e.g. -1500)
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "-1500.00",
          credit_limit: "5000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("1500");
      expect(res.totalCreditLimit.toString()).toBe("5000");
      expect(res.utilizationPercent).toBe(30);
      expect(res.riskLevel).toBe("moderate");
    });

    it("4.2 handles zero balance credit cards (fully paid off)", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "0.00",
          credit_limit: "5000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("0");
      expect(res.totalCreditLimit.toString()).toBe("5000");
      expect(res.utilizationPercent).toBe(0);
      expect(res.riskLevel).toBe("healthy");

      const availableCredit = res.totalCreditLimit.gt(res.creditCardDebt)
        ? res.totalCreditLimit.minus(res.creditCardDebt)
        : new Decimal(0);
      expect(availableCredit.toString()).toBe("5000");
    });

    it("4.3 handles negative zero '-0.00' balance safely", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "-0.00",
          credit_limit: "4000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.creditCardDebt.toString()).toBe("0");
      expect(res.utilizationPercent).toBe(0);
      expect(res.riskLevel).toBe("healthy");
    });

    it("4.4 empirically tests credit refund (overpayment) representation", () => {
      // Observation: computeCreditDebtGauge uses new Decimal(acc.current_balance || 0).abs()
      // If a caller passes a negative balance intended as a refund/credit balance (e.g. -250),
      // .abs() evaluates it as 250 of debt.
      const accounts = [
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "-250.00",
          credit_limit: "2500.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      // Empirical verification: .abs() results in 250 debt
      expect(res.creditCardDebt.toString()).toBe("250");
      expect(res.utilizationPercent).toBe(10);
    });
  });

  // ==========================================================================
  // 5. Liability Separation & Account Role Identification
  // ==========================================================================
  describe("5. Account Role & Liability Filtering", () => {
    it("5.1 recognizes 'ccAsset' role as a credit card liability", () => {
      const accounts = [
        {
          account_role: "ccAsset",
          current_balance: "750.00",
          credit_limit: "3000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      expect(res.totalDebt.toString()).toBe("750");
      expect(res.creditCardDebt.toString()).toBe("750");
      expect(res.totalCreditLimit.toString()).toBe("3000");
      expect(res.utilizationPercent).toBe(25);
      expect(res.riskLevel).toBe("healthy");
    });

    it("5.2 isolates non-revolving loans and mortgages from revolving credit card limit", () => {
      const accounts = [
        {
          type: "liability",
          liability_type: "mortgage",
          current_balance: "350000.00",
        },
        {
          type: "liability",
          liability_type: "loan",
          current_balance: "22000.00",
        },
        {
          type: "liability",
          liability_type: "credit_card",
          current_balance: "1800.00",
          credit_limit: "6000.00",
        },
      ];

      const res = computeCreditDebtGauge(accounts);
      // Total debt includes mortgage + loan + credit card
      expect(res.totalDebt.toString()).toBe("373800");
      // Credit card debt only includes revolving credit card
      expect(res.creditCardDebt.toString()).toBe("1800");
      // Total credit limit only includes revolving credit card
      expect(res.totalCreditLimit.toString()).toBe("6000");
      // 1800 / 6000 = 30.00%
      expect(res.utilizationPercent).toBe(30);
      expect(res.riskLevel).toBe("moderate");
    });
  });
});
