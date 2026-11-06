import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  computeBalanceTrend,
  computeCashFlowKpis,
  computeSpendingBreakdown,
  project30DayCashOutlook,
  computeCreditDebtGauge,
  type RecurrenceConfig,
  type UnpaidBillConfig,
} from "./test-harness";

describe("BudgetBakers Reports Aggregations (Tiers 1-4)", () => {
  // ==========================================================================
  // Tier 1: Feature Coverage (Primary Path Contracts)
  // ==========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: computes Balance Trend percentage change vs past period (+XX% or -XX%)", () => {
      // Current balance: 12,000, Previous balance: 10,000 -> +20.00%
      const resultUp = computeBalanceTrend({ currentTotal: 12000, previousTotal: 10000 });
      expect(resultUp.percentageChange).toBe(20);
      expect(resultUp.difference.toString()).toBe("2000");
      expect(resultUp.trend).toBe("up");

      // Current balance: 7,500, Previous balance: 10,000 -> -25.00%
      const resultDown = computeBalanceTrend({ currentTotal: 7500, previousTotal: 10000 });
      expect(resultDown.percentageChange).toBe(-25);
      expect(resultDown.difference.toString()).toBe("-2500");
      expect(resultDown.trend).toBe("down");
    });

    it("T1.2: flags flat trend when balance is unchanged", () => {
      const result = computeBalanceTrend({ currentTotal: 5000, previousTotal: 5000 });
      expect(result.percentageChange).toBe(0);
      expect(result.difference.toString()).toBe("0");
      expect(result.trend).toBe("flat");
    });

    it("T1.3: computes Cash-flow KPIs (Inflow, Outflow, Net Saved) with Decimal precision", () => {
      const transactions = [
        { type: "deposit", amount: "3500.50" },
        { type: "deposit", amount: "250.00" },
        { type: "withdrawal", amount: "1200.00" },
        { type: "withdrawal", amount: "450.75" },
      ];

      const kpis = computeCashFlowKpis(transactions);
      expect(kpis.inflow.toString()).toBe("3750.5");
      expect(kpis.outflow.toString()).toBe("1650.75");
      expect(kpis.netSaved.toString()).toBe("2099.75");
    });

    it("T1.4: computes Cash-flow Savings Rate percentage accurately", () => {
      // Inflow 4000, Outflow 3000 -> Net 1000 -> Savings Rate = (1000 / 4000) * 100 = 25%
      const transactions = [
        { type: "deposit", amount: "4000.00" },
        { type: "withdrawal", amount: "3000.00" },
      ];

      const kpis = computeCashFlowKpis(transactions);
      expect(kpis.savingsRatePercent).toBe(25);
    });

    it("T1.5: computes Spending Category Donut breakdown with percentage and descending order", () => {
      const expenses = [
        { category: "Housing", amount: "1200.00" },
        { category: "Groceries", amount: "600.00" },
        { category: "Transport", amount: "200.00" },
      ];

      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 30 });
      expect(breakdown.totalSpend.toString()).toBe("2000");
      expect(breakdown.categories.length).toBe(3);

      // Descending order check
      expect(breakdown.categories[0].name).toBe("Housing");
      expect(breakdown.categories[0].amount.toString()).toBe("1200");
      expect(breakdown.categories[0].percentage).toBe(60); // 1200 / 2000 = 60%

      expect(breakdown.categories[1].name).toBe("Groceries");
      expect(breakdown.categories[1].percentage).toBe(30); // 600 / 2000 = 30%

      expect(breakdown.categories[2].name).toBe("Transport");
      expect(breakdown.categories[2].percentage).toBe(10); // 200 / 2000 = 10%
    });

    it("T1.6: calculates daily average spend over period duration", () => {
      // Total 1500 over 30 days = 50.00/day
      const expenses = [{ category: "Food", amount: "1500.00" }];
      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 30 });
      expect(breakdown.dailyAverage.toString()).toBe("50");
    });

    it("T1.7: 30-day Outlook projects daily balances factoring recurrences and unpaid bills", () => {
      const recurrences: RecurrenceConfig[] = [
        // Daily coffee: 5.00
        { name: "Daily Coffee", amount: "5.00", type: "expense", cadence: "daily" },
      ];
      const unpaidBills: UnpaidBillConfig[] = [
        // Internet bill due 5 days later
        { name: "Internet", amount: "50.00", dueDate: "2026-11-11" },
      ];

      const outlook = project30DayCashOutlook({
        startingBalance: "1000.00",
        startDate: "2026-11-06",
        recurrences,
        unpaidBills,
      });

      expect(outlook.dailyBalances.length).toBe(30);
      // Day 1 (Nov 7): 1000 - 5 = 995
      expect(outlook.dailyBalances[0].date).toBe("2026-11-07");
      expect(outlook.dailyBalances[0].balance.toString()).toBe("995");

      // Day 5 (Nov 11): 1000 - (5 * 5) - 50 = 925
      const day5 = outlook.dailyBalances.find((d) => d.date === "2026-11-11");
      expect(day5?.balance.toString()).toBe("925");
    });

    it("T1.8: 30-day Outlook identifies minimum balance amount and minimum balance date", () => {
      const unpaidBills: UnpaidBillConfig[] = [
        { name: "Rent", amount: "600.00", dueDate: "2026-11-15" },
      ];
      const recurrences: RecurrenceConfig[] = [
        // Paycheck arrives on Nov 20 (monthly on 20th)
        { name: "Salary", amount: "1500.00", type: "income", cadence: "monthly", dayOfMonth: 20 },
      ];

      const outlook = project30DayCashOutlook({
        startingBalance: "1000.00",
        startDate: "2026-11-06",
        recurrences,
        unpaidBills,
      });

      // Min balance occurs right after rent (Nov 15) and before salary (Nov 20)
      expect(outlook.minBalance.toString()).toBe("400");
      expect(outlook.minBalanceDate).toBe("2026-11-15");
    });

    it("T1.9: Credit & Debt gauge computes total debt, credit card debt, and utilization rate", () => {
      const accounts = [
        { type: "liability", liability_type: "credit_card", current_balance: "1200", credit_limit: "4000" },
        { type: "liability", liability_type: "credit_card", current_balance: "800", credit_limit: "6000" },
        { type: "liability", liability_type: "loan", current_balance: "15000" }, // loan excluded from card limit
      ];

      const gauge = computeCreditDebtGauge(accounts);
      expect(gauge.totalDebt.toString()).toBe("17000"); // 1200 + 800 + 15000
      expect(gauge.creditCardDebt.toString()).toBe("2000"); // 1200 + 800
      expect(gauge.totalCreditLimit.toString()).toBe("10000"); // 4000 + 6000
      expect(gauge.utilizationPercent).toBe(20); // (2000 / 10000) * 100 = 20%
      expect(gauge.riskLevel).toBe("healthy");
    });

    it("T1.10: Credit & Debt gauge assigns correct risk tiers (healthy, moderate, high)", () => {
      // 25% utilization -> healthy (< 30%)
      const healthy = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "250", credit_limit: "1000" },
      ]);
      expect(healthy.riskLevel).toBe("healthy");

      // 40% utilization -> moderate (30% - 50%)
      const moderate = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "400", credit_limit: "1000" },
      ]);
      expect(moderate.riskLevel).toBe("moderate");

      // 65% utilization -> high (> 50%)
      const high = computeCreditDebtGauge([
        { type: "liability", liability_type: "credit_card", current_balance: "650", credit_limit: "1000" },
      ]);
      expect(high.riskLevel).toBe("high");
    });
  });

  // ==========================================================================
  // Tier 2: Boundary & Corner Cases (Robustness & Edge Conditions)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: balance trend handles zero previous balance without division by zero error", () => {
      const result = computeBalanceTrend({ currentTotal: 2500, previousTotal: 0 });
      expect(result.percentageChange).toBe(100);
      expect(result.difference.toString()).toBe("2500");
      expect(result.trend).toBe("up");
    });

    it("T2.2: balance trend handles both zero current and zero previous balance", () => {
      const result = computeBalanceTrend({ currentTotal: 0, previousTotal: 0 });
      expect(result.percentageChange).toBe(0);
      expect(result.difference.toString()).toBe("0");
      expect(result.trend).toBe("flat");
    });

    it("T2.3: cash-flow handles zero inflow with positive outflow", () => {
      const transactions = [{ type: "withdrawal", amount: "500.00" }];
      const kpis = computeCashFlowKpis(transactions);
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.outflow.toString()).toBe("500");
      expect(kpis.netSaved.toString()).toBe("-500");
      expect(kpis.savingsRatePercent).toBe(0); // cannot divide by zero inflow
    });

    it("T2.4: cash-flow handles empty transaction array", () => {
      const kpis = computeCashFlowKpis([]);
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.outflow.toString()).toBe("0");
      expect(kpis.netSaved.toString()).toBe("0");
      expect(kpis.savingsRatePercent).toBe(0);
    });

    it("T2.5: spending breakdown handles empty expenses list", () => {
      const breakdown = computeSpendingBreakdown({ expenses: [], periodDays: 30 });
      expect(breakdown.categories).toEqual([]);
      expect(breakdown.totalSpend.toString()).toBe("0");
      expect(breakdown.dailyAverage.toString()).toBe("0");
    });

    it("T2.6: spending breakdown handles single-day period", () => {
      const expenses = [{ category: "Dining", amount: "80.00" }];
      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 1 });
      expect(breakdown.totalSpend.toString()).toBe("80");
      expect(breakdown.dailyAverage.toString()).toBe("80");
    });

    it("T2.7: 30-day Outlook with zero recurrences and no bills produces flat trajectory", () => {
      const outlook = project30DayCashOutlook({
        startingBalance: "5000.00",
        startDate: "2026-11-06",
        recurrences: [],
        unpaidBills: [],
      });

      expect(outlook.dailyBalances.length).toBe(30);
      outlook.dailyBalances.forEach((d) => {
        expect(d.balance.toString()).toBe("5000");
      });
      expect(outlook.minBalance.toString()).toBe("5000");
      expect(outlook.endingBalance.toString()).toBe("5000");
    });

    it("T2.8: 30-day Outlook correctly steps across February 29 in leap year (2024)", () => {
      const outlook = project30DayCashOutlook({
        startingBalance: "1000",
        startDate: "2024-02-15", // Crossing Feb 29, 2024
        recurrences: [
          { name: "Daily", amount: "10", type: "expense", cadence: "daily" },
        ],
        unpaidBills: [
          { name: "Leap Day Bill", amount: "100", dueDate: "2024-02-29" },
        ],
      });

      const leapDay = outlook.dailyBalances.find((d) => d.date === "2024-02-29");
      expect(leapDay).toBeDefined();
      // 14 days from Feb 15 to Feb 29: 1000 - (14 * 10) - 100 = 760
      expect(leapDay?.balance.toString()).toBe("760");
    });

    it("T2.9: credit & debt gauge handles zero credit limit safely without throwing", () => {
      const accounts = [
        { type: "liability", liability_type: "credit_card", current_balance: "500", credit_limit: "0" },
      ];
      const gauge = computeCreditDebtGauge(accounts);
      expect(gauge.totalCreditLimit.toString()).toBe("0");
      expect(gauge.utilizationPercent).toBe(0);
      expect(gauge.riskLevel).toBe("healthy");
    });

    it("T2.10: credit & debt gauge handles over-limit utilization (> 100%)", () => {
      const accounts = [
        { type: "liability", liability_type: "credit_card", current_balance: "5500", credit_limit: "5000" },
      ];
      const gauge = computeCreditDebtGauge(accounts);
      expect(gauge.utilizationPercent).toBe(110);
      expect(gauge.riskLevel).toBe("high");
    });

    it("T2.11: spending breakdown groups unassigned categories into 'Uncategorized'", () => {
      const expenses = [
        { category: undefined, amount: "100.00" },
        { category: "   ", amount: "50.00" },
        { category: "Food", amount: "150.00" },
      ];

      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 7 });
      const uncat = breakdown.categories.find((c) => c.name === "Uncategorized");
      expect(uncat).toBeDefined();
      expect(uncat?.amount.toString()).toBe("150"); // 100 + 50
    });
  });

  // ==========================================================================
  // Tier 3: Cross-Feature Combinations (Pairwise Interoperability)
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: filter period change scales daily average spend proportionally", () => {
      const expenses = [
        { category: "Food", amount: "600.00" },
        { category: "Fun", amount: "300.00" },
      ];
      // Total 900
      const breakdown30D = computeSpendingBreakdown({ expenses, periodDays: 30 });
      expect(breakdown30D.dailyAverage.toString()).toBe("30"); // 900 / 30

      const breakdown7D = computeSpendingBreakdown({ expenses, periodDays: 7 });
      // 900 / 7 = 128.57
      expect(breakdown7D.dailyAverage.toString()).toBe("128.57");
    });

    it("T3.2: account net-worth exclusion updates Cash-Flow inflow and outflow totals", () => {
      const allTransactions = [
        { type: "deposit", amount: "3000", destination_id: "checking-1" },
        { type: "deposit", amount: "10000", destination_id: "crypto-secret-2" }, // excluded
        { type: "withdrawal", amount: "1500", source_id: "checking-1" },
        { type: "withdrawal", amount: "5000", source_id: "crypto-secret-2" }, // excluded
      ];

      const includedAccountIds = new Set(["checking-1"]);
      const filteredTransactions = allTransactions.filter((tx) =>
        tx.destination_id ? includedAccountIds.has(tx.destination_id) : tx.source_id ? includedAccountIds.has(tx.source_id) : false,
      );

      const kpisAll = computeCashFlowKpis(allTransactions);
      expect(kpisAll.inflow.toString()).toBe("13000");
      expect(kpisAll.outflow.toString()).toBe("6500");

      const kpisFiltered = computeCashFlowKpis(filteredTransactions);
      expect(kpisFiltered.inflow.toString()).toBe("3000");
      expect(kpisFiltered.outflow.toString()).toBe("1500");
      expect(kpisFiltered.savingsRatePercent).toBe(50);
    });

    it("T3.3: Outlook projection processes multiple events occurring on the exact same date", () => {
      // On Nov 15: Salary recurrence (+3000), Rent bill (-1200), Utility bill (-150)
      const recurrences: RecurrenceConfig[] = [
        { name: "Salary", amount: "3000", type: "income", cadence: "monthly", dayOfMonth: 15 },
      ];
      const unpaidBills: UnpaidBillConfig[] = [
        { name: "Rent", amount: "1200", dueDate: "2026-11-15" },
        { name: "Utility", amount: "150", dueDate: "2026-11-15" },
      ];

      const outlook = project30DayCashOutlook({
        startingBalance: "2000",
        startDate: "2026-11-06",
        recurrences,
        unpaidBills,
      });

      const nov15 = outlook.dailyBalances.find((d) => d.date === "2026-11-15");
      // Day before (Nov 14): 2000
      // Nov 15: 2000 + 3000 - 1200 - 150 = 3650
      expect(nov15?.balance.toString()).toBe("3650");
    });

    it("T3.4: separates revolving credit card debt from fixed loan liabilities in gauge", () => {
      const portfolio = [
        { type: "liability", liability_type: "mortgage", current_balance: "250000" },
        { type: "liability", liability_type: "auto_loan", current_balance: "18000" },
        { type: "liability", liability_type: "credit_card", current_balance: "1500", credit_limit: "5000" },
      ];

      const gauge = computeCreditDebtGauge(portfolio);
      expect(gauge.totalDebt.toString()).toBe("269500");
      expect(gauge.creditCardDebt.toString()).toBe("1500");
      expect(gauge.totalCreditLimit.toString()).toBe("5000");
      expect(gauge.utilizationPercent).toBe(30);
      expect(gauge.riskLevel).toBe("moderate");
    });
  });

  // ==========================================================================
  // Tier 4: Real-World Application Scenarios (End-to-End User Journeys)
  // ==========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4.1: complete monthly household financial cycle audit", () => {
      // 1. Initial balance setup
      const startingPortfolio = new Decimal("12500.00");

      // 2. Monthly cash flow
      const monthlyTx = [
        { type: "deposit", amount: "4200.00" }, // Net salary
        { type: "deposit", amount: "350.00" },  // Freelance dividend
        { type: "withdrawal", amount: "1450.00" }, // Rent
        { type: "withdrawal", amount: "650.00" },  // Groceries
        { type: "withdrawal", amount: "220.00" },  // Utilities
        { type: "withdrawal", amount: "380.00" },  // Dining & leisure
        { type: "withdrawal", amount: "600.00" },  // Credit card payoff
      ];

      const cashFlow = computeCashFlowKpis(monthlyTx);
      expect(cashFlow.inflow.toString()).toBe("4550");
      expect(cashFlow.outflow.toString()).toBe("3300");
      expect(cashFlow.netSaved.toString()).toBe("1250");
      // Savings rate: (1250 / 4550) * 100 = 27.47%
      expect(cashFlow.savingsRatePercent).toBe(27.47);

      // 3. Balance trend vs past month (ending last month at 11250)
      const currentEndBalance = startingPortfolio.plus(cashFlow.netSaved); // 13750
      const trend = computeBalanceTrend({ currentTotal: currentEndBalance, previousTotal: "12500" });
      expect(trend.percentageChange).toBe(10);
      expect(trend.trend).toBe("up");

      // 4. Spending category breakdown
      const spendingExpenses = [
        { category: "Housing", amount: "1450.00" },
        { category: "Food & Groceries", amount: "650.00" },
        { category: "Utilities", amount: "220.00" },
        { category: "Entertainment", amount: "380.00" },
        { category: "Debt Payoff", amount: "600.00" },
      ];

      const breakdown = computeSpendingBreakdown({ expenses: spendingExpenses, periodDays: 30 });
      expect(breakdown.totalSpend.toString()).toBe("3300");
      expect(breakdown.dailyAverage.toString()).toBe("110");
      expect(breakdown.categories[0].name).toBe("Housing");
      // Housing % = 1450 / 3300 = 43.94%
      expect(breakdown.categories[0].percentage).toBe(43.94);

      // 5. 30-Day Forward runway simulation
      const recurrences: RecurrenceConfig[] = [
        { name: "Salary", amount: "4200.00", type: "income", cadence: "monthly", dayOfMonth: 28 },
        { name: "Daily Living", amount: "25.00", type: "expense", cadence: "daily" },
      ];
      const unpaidBills: UnpaidBillConfig[] = [
        { name: "Upcoming Rent", amount: "1450.00", dueDate: "2026-12-01" },
      ];

      const outlook = project30DayCashOutlook({
        startingBalance: currentEndBalance,
        startDate: "2026-11-06",
        recurrences,
        unpaidBills,
      });

      expect(outlook.dailyBalances.length).toBe(30);
      expect(outlook.minBalance.gt(0)).toBe(true); // Liquid runway maintained
      expect(outlook.endingBalance.gt(currentEndBalance)).toBe(true); // Positive net growth
    });

    it("T4.2: accounts depletion warning and high credit utilization alert workflow", () => {
      // 1. High utilization scenario
      const creditCards = [
        { type: "liability", liability_type: "credit_card", current_balance: "4600", credit_limit: "5000" }, // 92% utilization
      ];
      const gauge = computeCreditDebtGauge(creditCards);
      expect(gauge.utilizationPercent).toBe(92);
      expect(gauge.riskLevel).toBe("high");

      // 2. Projected cash deficit simulation
      // Starting balance 800 with 1200 bill due on Nov 18, recovered by salary on Nov 25
      const outlook = project30DayCashOutlook({
        startingBalance: "800.00",
        startDate: "2026-11-06",
        recurrences: [
          { name: "Salary", amount: "2500.00", type: "income", cadence: "monthly", dayOfMonth: 25 },
        ],
        unpaidBills: [
          { name: "Emergency Repair", amount: "1200.00", dueDate: "2026-11-18" },
        ],
      });

      // On Nov 18, balance dips below zero to -400 before recovering on Nov 25
      expect(outlook.minBalance.toString()).toBe("-400");
      expect(outlook.minBalance.isNegative()).toBe(true);
      expect(outlook.minBalanceDate).toBe("2026-11-18");
      expect(outlook.endingBalance.toString()).toBe("2100");
    });

    it("T4.3: multi-category expense audit with descending percentages summing to 100%", () => {
      const expenses = [
        { category: "Housing", amount: "1200" },
        { category: "Groceries", amount: "400" },
        { category: "Transport", amount: "200" },
        { category: "Healthcare", amount: "150" },
        { category: "Subscriptions", amount: "50" },
      ];
      // Total 2000
      const breakdown = computeSpendingBreakdown({ expenses, periodDays: 30 });
      expect(breakdown.totalSpend.toString()).toBe("2000");

      const pctSum = breakdown.categories.reduce((acc, c) => acc + c.percentage, 0);
      expect(Math.round(pctSum)).toBe(100);

      // Verify strict descending order
      for (let i = 0; i < breakdown.categories.length - 1; i++) {
        expect(breakdown.categories[i].amount.gte(breakdown.categories[i + 1].amount)).toBe(true);
      }
    });
  });
});
