import type { NewSplit, Resource, Rule, RulePayload } from "@/lib/firefly/types";

/**
 * Finds if an existing automatic rule is linked to a bill by name.
 */
export function findMatchingRuleForBill(
  rules: Resource<Rule>[] | undefined,
  billName: string,
): Resource<Rule> | undefined {
  if (!rules || !billName) return undefined;
  const target = billName.trim().toLowerCase();
  return rules.find((r) =>
    r.attributes.actions?.some(
      (a) => a.type === "link_to_bill" && a.value?.trim().toLowerCase() === target,
    ),
  );
}

export interface BillRuleConfig {
  billName: string;
  ruleGroupId: string;
  title?: string;
  keyword?: string;
  matchType?: "description_contains" | "description_is" | "description_starts";
  category?: string;
  budgetId?: string;
  tag?: string;
}

/**
 * Builds the payload for creating an automated rule linked to a bill.
 */
export function buildBillRulePayload(config: BillRuleConfig): RulePayload {
  const cleanName = config.billName.trim();
  const keyword = config.keyword?.trim() || cleanName;
  const matchType = config.matchType || "description_contains";

  const triggers = [
    {
      type: matchType,
      value: keyword,
      active: true,
    },
  ];

  const actions: RulePayload["actions"] = [
    {
      type: "link_to_bill",
      value: cleanName,
      active: true,
    },
  ];

  if (config.category?.trim()) {
    actions.push({
      type: "set_category",
      value: config.category.trim(),
      active: true,
    });
  }

  if (config.budgetId?.trim()) {
    actions.push({
      type: "set_budget",
      value: config.budgetId.trim(),
      active: true,
    });
  }

  if (config.tag?.trim()) {
    actions.push({
      type: "add_tag",
      value: config.tag.trim(),
      active: true,
    });
  }

  return {
    title: config.title?.trim() || `Auto-match bill: ${cleanName}`,
    rule_group_id: String(config.ruleGroupId),
    trigger: "store-journal",
    strict: true,
    stop_processing: false,
    active: true,
    triggers,
    actions,
  };
}

export interface QuickPayParams {
  billId: string;
  billName: string;
  amount: string;
  currencyCode?: string;
  sourceAccountId: string;
  date?: string;
  category?: string;
  notes?: string;
}

/**
 * Builds the NewSplit transaction payload for immediate quick bill payment.
 */
export function buildQuickPaySplit(params: QuickPayParams): NewSplit {
  return {
    type: "withdrawal",
    date: params.date || new Date().toISOString().slice(0, 10),
    amount: params.amount,
    description: params.billName.trim(),
    source_id: params.sourceAccountId,
    destination_name: params.billName.trim(),
    currency_code: params.currencyCode,
    bill_id: params.billId,
    bill_name: params.billName.trim(),
    category_name: params.category?.trim() || undefined,
    notes: params.notes?.trim() || undefined,
  };
}

/**
 * Builds the URL with query parameters to open the /new transaction creation form pre-filled for a bill.
 */
export function buildNewTransactionUrlForBill(params: {
  billId: string;
  billName: string;
  amount: string;
  currencyCode?: string;
  sourceId?: string;
  category?: string;
}): string {
  const q = new URLSearchParams();
  q.set("type", "withdrawal");
  q.set("amount", params.amount);
  q.set("description", params.billName);
  q.set("counterparty", params.billName);
  q.set("billId", params.billId);
  q.set("billName", params.billName);
  if (params.sourceId) q.set("sourceId", params.sourceId);
  if (params.category) q.set("category", params.category);
  if (params.currencyCode) q.set("foreignCode", params.currencyCode);
  return `/new?${q.toString()}`;
}
