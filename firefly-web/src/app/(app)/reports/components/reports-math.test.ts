import { describe, expect, it } from "vitest";
import {
  computeBalanceTrend,
  computeCashFlowKpis,
  computeSpendingBreakdown,
  project30DayCashOutlook,
  computeCreditDebtGauge,
  type RecurrenceConfig,
  type UnpaidBillConfig,
} from "./reports-math";

describe("Milestone 4 Reports Mathematical Engine & Aggregations", () => {
  describe("1. Balance Trend ('Do I have more money than before?')", () => {
    it("computes positive growth percentage vs prior period", () => {
      const res = computeBalanceTrend({ currentTotal: 15000, previousTotal: 12000 });
      expect(res.percentageChange).toBe(25);
      expect(res.difference.toString()).toBe("3000");
      expect(res.trend).toBe("up");
    });

    it("computes negative drawdown percentage vs prior period", () => {
      const res = computeBalanceTrend({ currentTotal: 7500, previousTotal: 10000 });
      expect(res.percentageChange).toBe(-25);
      expect(res.difference.toString()).toBe("-2500");
      expect(res.trend).toBe("down");
    });

    it("handles zero previous balance without division by zero error", () => {
      const res = computeBalanceTrend({ currentTotal: 5000, previousTotal: 0 });
      expect(res.percentageChange).toBe(100);
      expect(res.difference.toString()).toBe("5000");
      expect(res.trend).toBe("up");
    });

    it("handles both current and previous zero balance", () => {
      const res = computeBalanceTrend({ currentTotal: 0, previousTotal: 0 });
      expect(res.percentageChange).toBe(0);
      expect(res.difference.toString()).toBe("0");
      expect(res.trend).toBe("flat");
    });

    it("handles unchanged non-zero balance as flat trend", () => {
      const res = computeBalanceTrend({ currentTotal: 8400, previousTotal: 8400 });
      expect(res.percentageChange).toBe(0);
      expect(res.difference.toString()).toBe("0");
      expect(res.trend).toBe("flat");
    });
  });

  describe("2. Cash-Flow KPIs & Savings Velocity", () => {
    it("computes inflow, outflow, and net saved accurately with Decimal precision", () => {
      const txs = [
        { type: "deposit", amount: "4500.50" },
        { type: "deposit", amount: "750.25" },
        { type: "withdrawal", amount: "1800.00" },
        { type: "withdrawal", amount: "450.75" },
      ];
      const kpis = computeCashFlowKpis(txs);
      expect(kpis.inflow.toString()).toBe("5250.75");
      expect(kpis.outflow.toString()).toBe("2250.75");
      expect(kpis.netSaved.toString()).toBe("3000");
      // (3000 / 5250.75) * 100 = 57.13%
      expect(kpis.savingsRatePercent).toBe(57.13);
    });

    it("handles zero inflow safely without division by zero", () => {
      const txs = [{ type: "withdrawal", amount: "1200.00" }];
      const kpis = computeCashFlowKpis(txs);
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.outflow.toString()).toBe("1200");
      expect(kpis.netSaved.toString()).toBe("-1200");
      expect(kpis.savingsRatePercent).toBe(0);
    });

    it("handles empty transactions array", () => {
      const kpis = computeCashFlowKpis([]);
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.outflow.toString()).toBe("0");
      expect(kpis.netSaved.toString()).toBe("0");
      expect(kpis.savingsRatePercent).toBe(0);
    });
  });

  describe("3. Spending Breakdown & Category Velocity", () => {
    it("computes category distribution in strict descending order with percentages summing to 100%", () => {
      const expenses = [
        { category: "Housing", amount: "1200.00" },
        { category: "Groceries", amount: "600.00" },
        { category: "Utilities", amount: "200.00" },
      ];
      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 30 });
      expect(breakdown.totalSpend.toString()).toBe("2000");
      expect(breakdown.dailyAverage.toString()).toBe("66.67");
      expect(breakdown.categories[0].name).toBe("Housing");
      expect(breakdown.categories[0].percentage).toBe(60);
      expect(breakdown.categories[1].name).toBe("Groceries");
      expect(breakdown.categories[1].percentage).toBe(30);
      expect(breakdown.categories[2].name).toBe("Utilities");
      expect(breakdown.categories[2].percentage).toBe(10);
    });

    it("groups unassigned and empty categories under 'Uncategorized'", () => {
      const expenses = [
        { category: undefined, amount: "150.00" },
        { category: "   ", amount: "50.00" },
        { category: "Dining", amount: "300.00" },
      ];
      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 7 });
      const uncat = breakdown.categories.find((c) => c.name === "Uncategorized");
      expect(uncat).toBeDefined();
      expect(uncat?.amount.toString()).toBe("200");
    });

    it("handles single-day period duration safely", () => {
      const expenses = [{ category: "Coffee", amount: "4.50" }];
      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 1 });
      expect(breakdown.totalSpend.toString()).toBe("4.5");
      expect(breakdown.dailyAverage.toString()).toBe("4.5");
    });
  });

  describe("4. 30-Day Outlook Forward Runway Simulation", () => {
    it("projects daily balances factoring recurrences and unpaid bills", () => {
      const recurrences: RecurrenceConfig[] = [
        { name: "Daily Lunch", amount: "15.00", type: "expense", cadence: "daily" },
      ];
      const unpaidBills: UnpaidBillConfig[] = [
        { name: "Gym Bill", amount: "60.00", dueDate: "2026-11-10" },
      ];

      const outlook = project30DayCashOutlook({
        startingBalance: "2000.00",
        startDate: "2026-11-06",
        recurrences,
        unpaidBills,
      });

      expect(outlook.dailyBalances.length).toBe(30);
      // Day 1 (Nov 7): 2000 - 15 = 1985
      expect(outlook.dailyBalances[0].date).toBe("2026-11-07");
      expect(outlook.dailyBalances[0].balance.toString()).toBe("1985");

      // Day 4 (Nov 10): 2000 - (4 * 15) - 60 = 1880
      const day4 = outlook.dailyBalances.find((d) => d.date === "2026-11-10");
      expect(day4?.balance.toString()).toBe("1880");
    });

    it("identifies minimum balance amount and date accurately", () => {
      const unpaidBills: UnpaidBillConfig[] = [
        { name: "Rent", amount: "1400.00", dueDate: "2026-11-15" },
      ];
      const recurrences: RecurrenceConfig[] = [
        // Salary on Nov 25
        { name: "Salary", amount: "3500.00", type: "income", cadence: "monthly", dayOfMonth: 25 },
      ];

      const outlook = project30DayCashOutlook({
        startingBalance: "1500.00",
        startDate: "2026-11-06",
        recurrences,
        unpaidBills,
      });

      expect(outlook.minBalance.toString()).toBe("100");
      expect(outlook.minBalanceDate).toBe("2026-11-15");
      expect(outlook.endingBalance.toString()).toBe("3600");
    });

    it("steps safely across February 29 in leap year (2024)", () => {
      const outlook = project30DayCashOutlook({
        startingBalance: "1000",
        startDate: "2024-02-15",
        recurrences: [{ name: "Daily", amount: "10", type: "expense", cadence: "daily" }],
        unpaidBills: [{ name: "Leap Bill", amount: "100", dueDate: "2024-02-29" }],
      });

      const leapDay = outlook.dailyBalances.find((d) => d.date === "2024-02-29");
      expect(leapDay).toBeDefined();
      expect(leapDay?.balance.toString()).toBe("760");
    });
  });

  describe("5. Credit & Debt Utilization Gauge", () => {
    it("computes total debt, credit card debt, and utilization rate", () => {
      const accounts = [
        { type: "liability", liability_type: "credit_card", current_balance: "1500", credit_limit: "5000" },
        { type: "liability", liability_type: "loan", current_balance: "25000" },
      ];
      const gauge = computeCreditDebtGauge(accounts);
      expect(gauge.totalDebt.toString()).toBe("26500");
      expect(gauge.creditCardDebt.toString()).toBe("1500");
      expect(gauge.totalCreditLimit.toString()).toBe("5000");
      expect(gauge.utilizationPercent).toBe(30);
      expect(gauge.riskLevel).toBe("moderate");
    });

    it("assigns healthy (<30%), moderate (30-50%), and high (>50%) risk tiers", () => {
      // 20% utilization -> healthy
      const healthy = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "400", credit_limit: "2000" },
      ]);
      expect(healthy.riskLevel).toBe("healthy");

      // 45% utilization -> moderate
      const moderate = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "900", credit_limit: "2000" },
      ]);
      expect(moderate.riskLevel).toBe("moderate");

      // 80% utilization -> high
      const high = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "1600", credit_limit: "2000" },
      ]);
      expect(high.riskLevel).toBe("high");
    });

    it("handles zero credit limit safely without throwing", () => {
      const gauge = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "500", credit_limit: "0" },
      ]);
      expect(gauge.totalCreditLimit.toString()).toBe("0");
      expect(gauge.utilizationPercent).toBe(0);
      expect(gauge.riskLevel).toBe("healthy");
    });

    it("handles over-limit credit utilization (>100%)", () => {
      const gauge = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "3500", credit_limit: "3000" },
      ]);
      expect(gauge.utilizationPercent).toBe(116.67);
      expect(gauge.riskLevel).toBe("high");
    });
  });
});
