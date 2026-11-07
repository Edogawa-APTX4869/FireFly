import { describe, expect, it } from "vitest";
import {
  buildBillRulePayload,
  buildNewTransactionUrlForBill,
  buildQuickPaySplit,
  findMatchingRuleForBill,
  type BillRuleConfig,
  type QuickPayParams,
} from "@/lib/bill-automation";
import type { Resource, Rule } from "@/lib/firefly/types";

describe("Subscriptions & Bills Automation: Quick Pay & Auto-Rules", () => {
  // Mock rules dataset
  const mockRules: Resource<Rule>[] = [
    {
      id: "101",
      type: "rules",
      attributes: {
        title: "Auto-match bill: Netflix",
        rule_group_id: "1",
        trigger: "store-journal",
        active: true,
        strict: true,
        stop_processing: false,
        triggers: [
          { type: "description_contains", value: "Netflix", active: true },
        ],
        actions: [
          { type: "link_to_bill", value: "Netflix", active: true },
          { type: "set_category", value: "Entertainment", active: true },
        ],
      },
    },
    {
      id: "102",
      type: "rules",
      attributes: {
        title: "Auto-match bill: AWS Cloud Services",
        rule_group_id: "1",
        trigger: "store-journal",
        active: true,
        strict: true,
        stop_processing: false,
        triggers: [
          { type: "description_contains", value: "Amazon Web Services", active: true },
        ],
        actions: [
          { type: "link_to_bill", value: "AWS Cloud Services", active: true },
        ],
      },
    },
    {
      id: "103",
      type: "rules",
      attributes: {
        title: "Unrelated Salary Rule",
        rule_group_id: "2",
        trigger: "store-journal",
        active: true,
        strict: true,
        stop_processing: false,
        triggers: [
          { type: "description_contains", value: "Salary", active: true },
        ],
        actions: [
          { type: "set_category", value: "Income", active: true },
        ],
      },
    },
  ];

  // ==========================================================================
  // 1. findMatchingRuleForBill
  // ==========================================================================
  describe("findMatchingRuleForBill", () => {
    it("finds rule matching bill name exactly", () => {
      const match = findMatchingRuleForBill(mockRules, "Netflix");
      expect(match).toBeDefined();
      expect(match?.id).toBe("101");
      expect(match?.attributes.title).toBe("Auto-match bill: Netflix");
    });

    it("finds rule with case-insensitive and trimmed name comparison", () => {
      const match = findMatchingRuleForBill(mockRules, "  netflix  ");
      expect(match).toBeDefined();
      expect(match?.id).toBe("101");

      const matchAws = findMatchingRuleForBill(mockRules, "aws cloud services");
      expect(matchAws).toBeDefined();
      expect(matchAws?.id).toBe("102");
    });

    it("returns undefined when no rule links to the bill", () => {
      const match = findMatchingRuleForBill(mockRules, "Spotify");
      expect(match).toBeUndefined();
    });

    it("gracefully handles empty rules list, undefined, or empty bill name", () => {
      expect(findMatchingRuleForBill([], "Netflix")).toBeUndefined();
      expect(findMatchingRuleForBill(undefined, "Netflix")).toBeUndefined();
      expect(findMatchingRuleForBill(mockRules, "")).toBeUndefined();
      expect(findMatchingRuleForBill(mockRules, "   ")).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. buildBillRulePayload
  // ==========================================================================
  describe("buildBillRulePayload", () => {
    it("builds a clean default automated rule payload for a bill", () => {
      const config: BillRuleConfig = {
        billName: "Spotify Premium",
        ruleGroupId: "5",
      };

      const payload = buildBillRulePayload(config);

      expect(payload.title).toBe("Auto-match bill: Spotify Premium");
      expect(payload.rule_group_id).toBe("5");
      expect(payload.trigger).toBe("store-journal");
      expect(payload.strict).toBe(true);
      expect(payload.active).toBe(true);
      expect(payload.stop_processing).toBe(false);

      expect(payload.triggers).toHaveLength(1);
      expect(payload.triggers[0]).toEqual({
        type: "description_contains",
        value: "Spotify Premium",
        active: true,
      });

      expect(payload.actions).toHaveLength(1);
      expect(payload.actions[0]).toEqual({
        type: "link_to_bill",
        value: "Spotify Premium",
        active: true,
      });
    });

    it("supports custom keyword and match type (e.g. description_starts)", () => {
      const config: BillRuleConfig = {
        billName: "Google Workspace",
        ruleGroupId: "5",
        keyword: "GOOGLE *GSUITE",
        matchType: "description_starts",
      };

      const payload = buildBillRulePayload(config);

      expect(payload.triggers[0]).toEqual({
        type: "description_starts",
        value: "GOOGLE *GSUITE",
        active: true,
      });
      expect(payload.actions[0]).toEqual({
        type: "link_to_bill",
        value: "Google Workspace",
        active: true,
      });
    });

    it("attaches category, budget, and tag actions when provided", () => {
      const config: BillRuleConfig = {
        billName: "Electricity Bill",
        ruleGroupId: "2",
        title: "Match Electricity Utility",
        keyword: "EWA BH",
        matchType: "description_contains",
        category: "Utilities",
        budgetId: "12",
        tag: "Housing",
      };

      const payload = buildBillRulePayload(config);

      expect(payload.title).toBe("Match Electricity Utility");
      expect(payload.actions).toEqual([
        { type: "link_to_bill", value: "Electricity Bill", active: true },
        { type: "set_category", value: "Utilities", active: true },
        { type: "set_budget", value: "12", active: true },
        { type: "add_tag", value: "Housing", active: true },
      ]);
    });

    it("omits empty or whitespace-only optional actions", () => {
      const config: BillRuleConfig = {
        billName: "Gym Membership",
        ruleGroupId: "3",
        category: "   ",
        budgetId: "",
        tag: undefined,
      };

      const payload = buildBillRulePayload(config);
      expect(payload.actions).toHaveLength(1);
      expect(payload.actions[0].type).toBe("link_to_bill");
    });
  });

  // ==========================================================================
  // 3. buildQuickPaySplit
  // ==========================================================================
  describe("buildQuickPaySplit", () => {
    it("creates a valid withdrawal split with bill_id and bill_name attached", () => {
      const params: QuickPayParams = {
        billId: "42",
        billName: "Internet Fiber 500M",
        amount: "35.500",
        currencyCode: "BHD",
        sourceAccountId: "7",
        date: "2026-11-07",
        category: "Bills",
        notes: "Account #99812",
      };

      const split = buildQuickPaySplit(params);

      expect(split.type).toBe("withdrawal");
      expect(split.date).toBe("2026-11-07");
      expect(split.amount).toBe("35.500");
      expect(split.description).toBe("Internet Fiber 500M");
      expect(split.destination_name).toBe("Internet Fiber 500M");
      expect(split.source_id).toBe("7");
      expect(split.currency_code).toBe("BHD");
      expect(split.bill_id).toBe("42");
      expect(split.bill_name).toBe("Internet Fiber 500M");
      expect(split.category_name).toBe("Bills");
      expect(split.notes).toBe("Account #99812");
    });

    it("defaults date to today if omitted and trims fields", () => {
      const params: QuickPayParams = {
        billId: "55",
        billName: "  iCloud 2TB Storage  ",
        amount: "9.99",
        sourceAccountId: "1",
      };

      const split = buildQuickPaySplit(params);

      expect(split.bill_name).toBe("iCloud 2TB Storage");
      expect(split.description).toBe("iCloud 2TB Storage");
      expect(split.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(split.category_name).toBeUndefined();
      expect(split.notes).toBeUndefined();
    });
  });

  // ==========================================================================
  // 4. buildNewTransactionUrlForBill
  // ==========================================================================
  describe("buildNewTransactionUrlForBill", () => {
    it("builds correct /new query string with billId and billName pre-filled", () => {
      const url = buildNewTransactionUrlForBill({
        billId: "88",
        billName: "Car Insurance",
        amount: "180.000",
        currencyCode: "BHD",
        sourceId: "4",
        category: "Insurance",
      });

      expect(url).toContain("/new?");
      const params = new URLSearchParams(url.replace("/new?", ""));

      expect(params.get("type")).toBe("withdrawal");
      expect(params.get("amount")).toBe("180.000");
      expect(params.get("description")).toBe("Car Insurance");
      expect(params.get("counterparty")).toBe("Car Insurance");
      expect(params.get("billId")).toBe("88");
      expect(params.get("billName")).toBe("Car Insurance");
      expect(params.get("sourceId")).toBe("4");
      expect(params.get("category")).toBe("Insurance");
      expect(params.get("foreignCode")).toBe("BHD");
    });

    it("properly URL-encodes special characters in bill names", () => {
      const url = buildNewTransactionUrlForBill({
        billId: "99",
        billName: "Netflix & Chill (4K Plan)",
        amount: "7.99",
      });

      expect(url).toContain("billName=Netflix+%26+Chill+%284K+Plan%29");
      const params = new URLSearchParams(url.replace("/new?", ""));
      expect(params.get("billName")).toBe("Netflix & Chill (4K Plan)");
    });
  });
});
