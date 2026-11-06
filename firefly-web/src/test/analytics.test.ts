import { describe, expect, it } from "vitest";
import type { Account, TransactionGroup, TransactionSplit } from "@/lib/firefly/types";
import { compute30DayKpis, formatAccountMetadata } from "./test-harness";
import { computeAccount30dKpi } from "@/app/(app)/accounts/[id]/account-detail-client";

describe("R2: Account Detail Analytics & Usability (Tiers 1-4)", () => {
  const TODAY = "2026-11-06";
  const ACCOUNT_ID = "acc-42";

  // Helper to construct a transaction group
  const createGroup = (
    date: string,
    splits: Partial<TransactionSplit>[],
  ): TransactionGroup => ({
    created_at: date,
    transactions: splits.map((s) => ({
      date: s.date || date,
      type: s.type || "withdrawal",
      amount: s.amount || "0",
      description: s.description || "Test split",
      source_id: s.source_id,
      destination_id: s.destination_id,
      foreign_amount: s.foreign_amount,
    })),
  });

  // Helper to adapt TransactionGroup to the structure consumed by computeAccount30dKpi in client
  const adaptForClientKpi = (groups: TransactionGroup[]) =>
    groups.map((g) => ({
      attributes: {
        transactions: g.transactions.map((t) => ({
          type: t.type,
          amount: t.amount,
          source_id: t.source_id,
          destination_id: t.destination_id,
          foreign_amount: t.foreign_amount,
        })),
      },
    }));

  // ==========================================================================
  // Tier 1: Feature Coverage (>= 5 tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage", () => {
    it("T1.1: computes 30-day Inflow accurately from deposits and incoming transfers", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-01", [
          { type: "deposit", amount: "1500.00", destination_id: ACCOUNT_ID },
        ]),
        createGroup("2026-11-03", [
          { type: "transfer", amount: "350.50", destination_id: ACCOUNT_ID, source_id: "savings-1" },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("1850.5");
      expect(kpis.outflow.toString()).toBe("0");

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.inflow.toString()).toBe("1850.5");
    });

    it("T1.2: computes 30-day Outflow accurately from withdrawals and outgoing transfers", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-10-25", [
          { type: "withdrawal", amount: "120.75", source_id: ACCOUNT_ID },
        ]),
        createGroup("2026-10-28", [
          { type: "transfer", amount: "400.00", source_id: ACCOUNT_ID, destination_id: "brokerage-1" },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.outflow.toString()).toBe("520.75");

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.outflow.toString()).toBe("520.75");
    });

    it("T1.3: computes Net 30D Change accurately as (Inflow - Outflow)", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-02", [
          { type: "deposit", amount: "2000.00", destination_id: ACCOUNT_ID },
        ]),
        createGroup("2026-11-04", [
          { type: "withdrawal", amount: "750.25", source_id: ACCOUNT_ID },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("2000");
      expect(kpis.outflow.toString()).toBe("750.25");
      expect(kpis.netChange.toString()).toBe("1249.75");

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.netChange.toString()).toBe("1249.75");
    });

    it("T1.4: computes Transaction Count of transactions within 30-day window", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-10-15", [
          { type: "deposit", amount: "100.00", destination_id: ACCOUNT_ID },
        ]),
        createGroup("2026-10-20", [
          { type: "withdrawal", amount: "45.00", source_id: ACCOUNT_ID },
        ]),
        createGroup("2026-11-05", [
          { type: "withdrawal", amount: "15.00", source_id: ACCOUNT_ID },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.transactionCount).toBe(3);

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.count).toBe(3);
    });

    it("T1.5: extracts and formats all 5 Account Metadata Card fields", () => {
      const account: Partial<Account> = {
        iban: "NL91 ABNA 0417 1643 00",
        account_role: "defaultAsset",
        current_balance_date: "2026-11-06",
        currency_code: "EUR",
        notes: "Main household account for shared bills",
      };

      const meta = formatAccountMetadata(account);
      expect(meta.iban).toBe("NL91 ABNA 0417 1643 00");
      expect(meta.role).toBe("defaultAsset");
      expect(meta.openingBalanceDate).toBe("2026-11-06");
      expect(meta.currency).toBe("EUR");
      expect(meta.notes).toBe("Main household account for shared bills");
    });

    it("T1.6: accounts for opening balance splits within the 30-day window", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-10-10", [
          { type: "opening balance", amount: "5000.00", destination_id: ACCOUNT_ID },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("5000");
      expect(kpis.netChange.toString()).toBe("5000");

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.inflow.toString()).toBe("5000");
      expect(clientKpis.netChange.toString()).toBe("5000");
    });
  });

  // ==========================================================================
  // Tier 2: Boundary & Corner Cases (>= 5 tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("T2.1: includes transactions exactly on Day 30 and excludes Day 31 cutoff", () => {
      // Reference date: 2026-11-06
      // 30 days prior: 2026-10-07
      // 31 days prior: 2026-10-06 (out of window)
      const groups: TransactionGroup[] = [
        createGroup("2026-10-07", [
          { type: "deposit", amount: "100.00", destination_id: ACCOUNT_ID }, // Day 30: INCLUDED
        ]),
        createGroup("2026-10-06", [
          { type: "deposit", amount: "999.00", destination_id: ACCOUNT_ID }, // Day 31: EXCLUDED
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("100");
      expect(kpis.transactionCount).toBe(1);
    });

    it("T2.2: preserves Decimal.js precision for fractional cents and floats without drift", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-01", [
          { type: "deposit", amount: "0.10", destination_id: ACCOUNT_ID },
          { type: "deposit", amount: "0.20", destination_id: ACCOUNT_ID },
          { type: "deposit", amount: "0.05", destination_id: ACCOUNT_ID },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      // 0.10 + 0.20 + 0.05 in binary floating point is 0.35000000000000003
      // With Decimal.js it MUST be exactly 0.35
      expect(kpis.inflow.toString()).toBe("0.35");
      expect(kpis.netChange.toString()).toBe("0.35");

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.inflow.toString()).toBe("0.35");
    });

    it("T2.3: maintains precision for high-magnitude financial transactions", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-01", [
          { type: "deposit", amount: "123456789.95", destination_id: ACCOUNT_ID },
          { type: "withdrawal", amount: "23456789.45", source_id: ACCOUNT_ID },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("123456789.95");
      expect(kpis.outflow.toString()).toBe("23456789.45");
      expect(kpis.netChange.toString()).toBe("100000000.5");
    });

    it("T2.4: returns zero for all metrics when account has no transactions", () => {
      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups: [], referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.outflow.toString()).toBe("0");
      expect(kpis.netChange.toString()).toBe("0");
      expect(kpis.transactionCount).toBe(0);

      const clientKpis = computeAccount30dKpi([], ACCOUNT_ID);
      expect(clientKpis.inflow.toString()).toBe("0");
      expect(clientKpis.outflow.toString()).toBe("0");
      expect(clientKpis.netChange.toString()).toBe("0");
      expect(clientKpis.count).toBe(0);
    });

    it("T2.5: handles multi-split journal ignoring splits belonging to other accounts", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-02", [
          { type: "withdrawal", amount: "50.00", source_id: ACCOUNT_ID }, // This account
          { type: "withdrawal", amount: "80.00", source_id: "other-acc" }, // Other account
          { type: "deposit", amount: "150.00", destination_id: "other-acc" }, // Other account
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.outflow.toString()).toBe("50");
      expect(kpis.inflow.toString()).toBe("0");
      expect(kpis.transactionCount).toBe(1);
    });

    it("T2.6: correctly computes negative net change when outflow exceeds inflow", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-01", [
          { type: "deposit", amount: "500.00", destination_id: ACCOUNT_ID },
        ]),
        createGroup("2026-11-02", [
          { type: "withdrawal", amount: "1250.75", source_id: ACCOUNT_ID },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });
      expect(kpis.inflow.toString()).toBe("500");
      expect(kpis.outflow.toString()).toBe("1250.75");
      expect(kpis.netChange.toString()).toBe("-750.75");

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.netChange.toString()).toBe("-750.75");
    });

    it("T2.7: provides clean fallbacks for empty and undefined metadata card fields", () => {
      const emptyAccount: Partial<Account> = {
        name: "Minimalist Account",
      };

      const meta = formatAccountMetadata(emptyAccount);
      expect(meta.iban).toBe("—");
      expect(meta.role).toBe("—");
      expect(meta.openingBalanceDate).toBe("—");
      expect(meta.currency).toBe("—");
      expect(meta.notes).toBe("No notes recorded");
    });
  });

  // ==========================================================================
  // Tier 3: Cross-Feature Combinations
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("T3.1: uses foreign_amount when foreign currency is converted for incoming transfer", () => {
      const groups: TransactionGroup[] = [
        createGroup("2026-11-01", [
          {
            type: "transfer",
            amount: "100.00", // USD sent from source
            foreign_amount: "92.50", // EUR received at destination
            source_id: "usd-acc",
            destination_id: ACCOUNT_ID,
          },
        ]),
      ];

      const clientKpis = computeAccount30dKpi(adaptForClientKpi(groups), ACCOUNT_ID);
      expect(clientKpis.inflow.toString()).toBe("92.5");
      expect(clientKpis.netChange.toString()).toBe("92.5");
    });

    it("T3.2: transfer between two accounts creates symmetric outflow and inflow", () => {
      const acc1 = "acc-primary";
      const acc2 = "acc-secondary";

      const groups: TransactionGroup[] = [
        createGroup("2026-11-03", [
          {
            type: "transfer",
            amount: "300.00",
            source_id: acc1,
            destination_id: acc2,
          },
        ]),
      ];

      const kpis1 = computeAccount30dKpi(adaptForClientKpi(groups), acc1);
      const kpis2 = computeAccount30dKpi(adaptForClientKpi(groups), acc2);

      expect(kpis1.outflow.toString()).toBe("300");
      expect(kpis1.inflow.toString()).toBe("0");
      expect(kpis1.netChange.toString()).toBe("-300");

      expect(kpis2.inflow.toString()).toBe("300");
      expect(kpis2.outflow.toString()).toBe("0");
      expect(kpis2.netChange.toString()).toBe("300");

      // Zero-sum cross-account property
      expect(kpis1.netChange.plus(kpis2.netChange).toString()).toBe("0");
    });
  });

  // ==========================================================================
  // Tier 4: Real-World Application Scenarios
  // ==========================================================================
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("T4.1: Scenario - Monthly checking account ledger with mixed inflows and outflows", () => {
      const groups: TransactionGroup[] = [
        // 1. Monthly paycheck deposit (inflow)
        createGroup("2026-10-15", [
          { type: "deposit", amount: "4200.00", destination_id: ACCOUNT_ID, description: "Monthly Salary" },
        ]),
        // 2. Rent payment transfer (outflow)
        createGroup("2026-10-18", [
          { type: "transfer", amount: "1450.00", source_id: ACCOUNT_ID, destination_id: "landlord", description: "Apartment Rent" },
        ]),
        // 3. Electric utility withdrawal (outflow)
        createGroup("2026-10-22", [
          { type: "withdrawal", amount: "85.40", source_id: ACCOUNT_ID, description: "Electric Company" },
        ]),
        // 4. Grocery supermarket withdrawal (outflow)
        createGroup("2026-10-29", [
          { type: "withdrawal", amount: "134.60", source_id: ACCOUNT_ID, description: "Supermarket" },
        ]),
        // 5. Merchant refund deposit (inflow)
        createGroup("2026-11-04", [
          { type: "deposit", amount: "45.00", destination_id: ACCOUNT_ID, description: "Online store return" },
        ]),
        // 6. Old transaction from 45 days ago (must be excluded from 30D window)
        createGroup("2026-09-20", [
          { type: "withdrawal", amount: "999.00", source_id: ACCOUNT_ID, description: "Historical expense" },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });

      // Inflow: 4200 + 45 = 4245.00
      expect(kpis.inflow.toString()).toBe("4245");

      // Outflow: 1450 + 85.40 + 134.60 = 1670.00
      expect(kpis.outflow.toString()).toBe("1670");

      // Net Change: 4245 - 1670 = 2575.00
      expect(kpis.netChange.toString()).toBe("2575");

      // Count in 30D: 5 transactions (historical 6th excluded)
      expect(kpis.transactionCount).toBe(5);
    });

    it("T4.2: Scenario - Freelancer consulting account with invoice receipts & tax transfer", () => {
      const groups: TransactionGroup[] = [
        // Invoice 1 received
        createGroup("2026-10-12", [
          { type: "deposit", amount: "2800.00", destination_id: ACCOUNT_ID, description: "Client Alpha Retainer" },
        ]),
        // Invoice 2 received
        createGroup("2026-10-24", [
          { type: "deposit", amount: "3500.00", destination_id: ACCOUNT_ID, description: "Client Beta Milestone" },
        ]),
        // 30% Tax transfer set aside
        createGroup("2026-10-26", [
          { type: "transfer", amount: "1890.00", source_id: ACCOUNT_ID, destination_id: "tax-sub-account", description: "Tax Reserve 30%" },
        ]),
        // Software subscription expense
        createGroup("2026-11-02", [
          { type: "withdrawal", amount: "110.00", source_id: ACCOUNT_ID, description: "Development Tools" },
        ]),
      ];

      const kpis = compute30DayKpis({ accountId: ACCOUNT_ID, groups, referenceDate: TODAY });

      // Inflow: 2800 + 3500 = 6300.00
      expect(kpis.inflow.toString()).toBe("6300");

      // Outflow: 1890 + 110 = 2000.00
      expect(kpis.outflow.toString()).toBe("2000");

      // Net 30D Profit: 6300 - 2000 = 4300.00
      expect(kpis.netChange.toString()).toBe("4300");
      expect(kpis.transactionCount).toBe(4);
    });
  });
});
