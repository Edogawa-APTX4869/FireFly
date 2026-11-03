"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { api } from "@/lib/firefly/api";
import type {
  Bill,
  Category,
  Recurrence,
  Resource,
  Rule,
  RuleGroup,
  RuleMoment,
  RulePayload,
  TransactionGroup,
} from "@/lib/firefly/types";
import { ASSET_LIKE, useAccounts, useCurrencies, usePrimaryCurrency } from "@/lib/hooks";
import { cn, formatDate, isoDate, monthRange, parseAmount } from "@/lib/utils";
import { CategoryCascadeSelect } from "@/components/category-cascade";
import { TransactionRow } from "@/components/transaction-row";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/providers";

// Common Firefly III rule triggers & whether they require a value
export const TRIGGER_OPTIONS: Array<{ value: string; label: string; needsValue: boolean; hint?: string }> = [
  { value: "description_contains", label: "Description contains", needsValue: true, hint: "e.g. Uber, Netflix, Salary" },
  { value: "description_is", label: "Description is exactly", needsValue: true },
  { value: "description_starts", label: "Description starts with", needsValue: true },
  { value: "description_ends", label: "Description ends with", needsValue: true },
  { value: "source_account_is", label: "Source account is", needsValue: true, hint: "Exact account name" },
  { value: "source_account_contains", label: "Source account contains", needsValue: true },
  { value: "destination_account_is", label: "Destination account is", needsValue: true, hint: "Exact account name" },
  { value: "destination_account_contains", label: "Destination account contains", needsValue: true },
  { value: "transaction_type", label: "Transaction type is", needsValue: true, hint: "withdrawal, deposit, or transfer" },
  { value: "amount_exactly", label: "Amount is exactly", needsValue: true, hint: "e.g. 25.000" },
  { value: "amount_more", label: "Amount is more than", needsValue: true },
  { value: "amount_less", label: "Amount is less than", needsValue: true },
  { value: "currency_is", label: "Currency code is", needsValue: true, hint: "e.g. BHD, USD" },
  { value: "foreign_currency_is", label: "Foreign currency is", needsValue: true, hint: "e.g. USD" },
  { value: "category_is", label: "Category is", needsValue: true },
  { value: "budget_is", label: "Budget is", needsValue: true },
  { value: "tag_is", label: "Has tag", needsValue: true },
  { value: "notes_contains", label: "Notes contain", needsValue: true },
  { value: "has_no_category", label: "Has no category", needsValue: false },
  { value: "has_no_budget", label: "Has no budget", needsValue: false },
  { value: "has_no_tag", label: "Has no tags", needsValue: false },
  { value: "has_any_category", label: "Has any category", needsValue: false },
  { value: "has_any_budget", label: "Has any budget", needsValue: false },
  { value: "has_any_tag", label: "Has any tag", needsValue: false },
];

export const ACTION_OPTIONS: Array<{
  value: string;
  label: string;
  needsValue: boolean;
  datalist?: "categories" | "budgets" | "tags" | "accounts" | "bills";
  hint?: string;
}> = [
  { value: "set_category", label: "Set category to", needsValue: true, datalist: "categories" },
  { value: "clear_category", label: "Clear category", needsValue: false },
  { value: "set_budget", label: "Set budget to", needsValue: true, datalist: "budgets" },
  { value: "clear_budget", label: "Clear budget", needsValue: false },
  { value: "add_tag", label: "Add tag", needsValue: true, datalist: "tags" },
  { value: "remove_tag", label: "Remove tag", needsValue: true, datalist: "tags" },
  { value: "remove_all_tags", label: "Remove all tags", needsValue: false },
  { value: "set_description", label: "Set description to", needsValue: true },
  { value: "set_source_account", label: "Set source account to", needsValue: true, datalist: "accounts" },
  { value: "set_destination_account", label: "Set destination account to", needsValue: true, datalist: "accounts" },
  { value: "set_notes", label: "Set notes to", needsValue: true },
  { value: "clear_notes", label: "Clear notes", needsValue: false },
  { value: "link_to_bill", label: "Link to bill / subscription", needsValue: true, datalist: "bills" },
  { value: "convert_withdrawal", label: "Convert to expense (withdrawal)", needsValue: true, datalist: "accounts", hint: "Destination expense account name" },
  { value: "convert_deposit", label: "Convert to income (deposit)", needsValue: true, datalist: "accounts", hint: "Source revenue account name" },
  { value: "convert_transfer", label: "Convert to transfer", needsValue: true, datalist: "accounts", hint: "Opposing asset account name" },
  { value: "switch_accounts", label: "Swap source and destination accounts", needsValue: false },
  { value: "delete_transaction", label: "Delete transaction", needsValue: false },
];

type TabKey = "rules" | "recurrences" | "bills";

export function RulesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab");
  const tab: TabKey = rawTab === "recurrences" || rawTab === "bills" ? rawTab : "rules";
  const setTab = (next: TabKey) => router.replace(`/rules?tab=${next}`, { scroll: false });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Automation & Rules"
        subtitle="Configure Firefly III's automatic rule engine, recurring transactions, and bills"
      />

      <div role="tablist" aria-label="Automation sections" className="flex flex-wrap gap-1 rounded-2xl bg-surface-2 p-1">
        {(
          [
            { key: "rules", label: "Automatic Rules", icon: Wand2 },
            { key: "recurrences", label: "Recurring Transactions", icon: Repeat },
            { key: "bills", label: "Bills & Subscriptions", icon: Sparkles },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
              tab === t.key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rules" && <RulesSection />}
      {tab === "recurrences" && <RecurrencesSection />}
      {tab === "bills" && <BillsSection />}
    </div>
  );
}

// ============================================================================
// 1. AUTOMATIC RULES & RULE GROUPS
// ============================================================================

function RulesSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const month = useMemo(() => monthRange(0), []);

  const rulesQ = useQuery({ queryKey: ["rules"], queryFn: api.rules });
  const groupsQ = useQuery({ queryKey: ["rule-groups"], queryFn: api.ruleGroups });
  const accountsQ = useAccounts("all");
  const categoriesQ = useQuery({ queryKey: ["categories-list"], queryFn: () => api.categories(), staleTime: 5 * 60_000 });
  const budgetsQ = useQuery({
    queryKey: ["budgets-list"],
    queryFn: () => api.budgets(month.start, month.end),
    staleTime: 5 * 60_000,
  });
  const tagsQ = useQuery({ queryKey: ["tags-list"], queryFn: api.tags, staleTime: 5 * 60_000 });
  const billsQ = useQuery({ queryKey: ["bills"], queryFn: () => api.bills(), staleTime: 5 * 60_000 });

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<Resource<Rule> | null>(null);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ title: string; matches: Resource<TransactionGroup>[] } | null>(null);

  // Date range for testing / triggering rules on existing transactions
  const [execStart, setExecStart] = useState(month.start);
  const [execEnd, setExecEnd] = useState(month.end);

  const createGroupMut = useMutation({
    mutationFn: () => {
      if (!newGroupTitle.trim()) throw new Error("Enter a rule group title.");
      return api.createRuleGroup(newGroupTitle.trim());
    },
    onSuccess: () => {
      toast("Rule group created");
      setNewGroupTitle("");
      setShowNewGroup(false);
      qc.invalidateQueries({ queryKey: ["rule-groups"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const delRuleMut = useMutation({
    mutationFn: (id: string) => api.deleteRule(id),
    onSuccess: () => {
      toast("Rule deleted", "info");
      qc.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const toggleRuleMut = useMutation({
    mutationFn: (r: Resource<Rule>) =>
      api.updateRule(r.id, {
        title: r.attributes.title,
        rule_group_id: r.attributes.rule_group_id,
        trigger: r.attributes.trigger,
        strict: r.attributes.strict,
        stop_processing: r.attributes.stop_processing,
        active: !r.attributes.active,
        triggers: r.attributes.triggers.map((t) => ({
          type: t.type,
          value: t.value,
          prohibited: t.prohibited,
          active: t.active ?? true,
          stop_processing: t.stop_processing ?? false,
        })),
        actions: r.attributes.actions.map((a) => ({
          type: a.type,
          value: a.value,
          active: a.active ?? true,
          stop_processing: a.stop_processing ?? false,
        })),
      }),
    onSuccess: () => {
      toast("Rule updated");
      qc.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const testRuleMut = useMutation({
    mutationFn: async (r: Resource<Rule>) => {
      const res = await api.testRule(r.id, { start: execStart, end: execEnd });
      return { title: r.attributes.title, matches: res.data ?? [] };
    },
    onSuccess: (data) => setPreviewResult(data),
    onError: (e) => toast((e as Error).message, "error"),
  });

  const triggerRuleMut = useMutation({
    mutationFn: (id: string) => api.triggerRule(id, { start: execStart, end: execEnd }),
    onSuccess: () => {
      toast("Rule executed on transactions in range!");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const triggerGroupMut = useMutation({
    mutationFn: (id: string) => api.triggerRuleGroup(id, { start: execStart, end: execEnd }),
    onSuccess: () => {
      toast("Rule group executed on transactions in range!");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const groups = groupsQ.data ?? [];
  const rules = rulesQ.data ?? [];

  // Group rules by rule_group_id
  const rulesByGroup = (() => {
    const map = new Map<string, { group: Resource<RuleGroup> | null; title: string; items: Resource<Rule>[] }>();
    for (const g of groups) {
      map.set(String(g.id), { group: g, title: g.attributes.title, items: [] });
    }
    for (const r of rules) {
      const gid = String(r.attributes.rule_group_id);
      const entry = map.get(gid) ?? {
        group: null,
        title: r.attributes.rule_group_title || `Group #${gid}`,
        items: [],
      };
      entry.items.push(r);
      map.set(gid, entry);
    }
    return [...map.values()];
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <Card className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Test / Run From">
            {(id) => <Input id={id} type="date" value={execStart} onChange={(e) => setExecStart(e.target.value)} className="h-9 text-xs" />}
          </Field>
          <Field label="To">
            {(id) => <Input id={id} type="date" value={execEnd} onChange={(e) => setExecEnd(e.target.value)} className="h-9 text-xs" />}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowNewGroup((s) => !s)}>
            <FolderPlus className="size-4" aria-hidden /> New Rule Group
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingRule(null);
              setShowBuilder(true);
            }}
          >
            <Plus className="size-4" aria-hidden /> New Rule
          </Button>
        </div>
      </Card>

      {showNewGroup && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createGroupMut.mutate();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <Field label="New rule group title" className="min-w-56 flex-1">
              {(id) => (
                <Input
                  id={id}
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="e.g. Categorization, Auto-Budget, Subscriptions"
                  autoFocus
                  required
                />
              )}
            </Field>
            <Button type="submit" size="sm" loading={createGroupMut.isPending}>
              Create group
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewGroup(false)}>
              Cancel
            </Button>
          </form>
        </Card>
      )}

      {(showBuilder || editingRule) && (
        <RuleBuilderCard
          groups={groups}
          initial={editingRule}
          accounts={(accountsQ.data ?? []).map((a) => a.attributes.name)}
          categories={categoriesQ.data ?? []}
          budgets={(budgetsQ.data ?? []).map((b) => b.attributes.name)}
          tags={(tagsQ.data ?? []).map((t) => t.attributes.tag)}
          bills={(billsQ.data ?? []).map((b) => b.attributes.name)}
          onClose={() => {
            setShowBuilder(false);
            setEditingRule(null);
          }}
        />
      )}

      {previewResult && (
        <Card className="border-primary">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Test Matches for &ldquo;{previewResult.title}&rdquo;</h3>
              <p className="text-xs text-muted">
                {previewResult.matches.length} transaction(s) matched between {execStart} and {execEnd}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPreviewResult(null)} aria-label="Close test results">
              <X className="size-4" />
            </Button>
          </div>
          {previewResult.matches.length === 0 ? (
            <p className="text-sm text-muted">No transactions in this date range matched the rule triggers.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {previewResult.matches.map((g) => (
                <TransactionRow key={g.id} group={g} />
              ))}
            </ul>
          )}
        </Card>
      )}

      <ErrorBox error={rulesQ.error || groupsQ.error} />

      {rulesQ.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : rulesByGroup.length === 0 ? (
        <EmptyState title="No automatic rules configured yet">
          Click &ldquo;New Rule&rdquo; above to automatically categorize, budget, tag, or transform incoming transactions.
        </EmptyState>
      ) : (
        rulesByGroup.map(({ group, title, items }) => (
          <Card key={group?.id ?? title} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{title}</h2>
                <Badge tone="neutral">{items.length} rules</Badge>
              </div>
              {group && items.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={triggerGroupMut.isPending}
                  onClick={() => triggerGroupMut.mutate(String(group.id))}
                >
                  <Play className="size-3.5" aria-hidden /> Run group ({execStart} → {execEnd})
                </Button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="py-2 text-sm text-muted">No rules in this group yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((r) => {
                  const a = r.attributes;
                  return (
                    <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("font-semibold", !a.active && "line-through text-muted")}>{a.title}</span>
                          <Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Active" : "Paused"}</Badge>
                          <Badge tone="primary">
                            {a.trigger === "store-journal"
                              ? "On create"
                              : a.trigger === "update-journal"
                                ? "On update"
                                : "Manual"}
                          </Badge>
                          <Badge tone="neutral">{a.strict ? "ALL triggers (AND)" : "ANY trigger (OR)"}</Badge>
                          {a.stop_processing && <Badge tone="warning">Stop group after match</Badge>}
                        </div>
                        {a.description && <p className="mt-0.5 text-xs text-muted">{a.description}</p>}

                        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                          <div className="rounded-xl bg-surface-2 p-2.5">
                            <p className="mb-1 font-semibold text-muted uppercase">If ({a.strict ? "ALL" : "ANY"})</p>
                            <ul className="flex flex-col gap-1">
                              {a.triggers.map((t, idx) => (
                                <li key={t.id ?? idx} className="truncate">
                                  {t.prohibited && <span className="font-semibold text-danger">NOT </span>}
                                  <span className="font-medium">
                                    {TRIGGER_OPTIONS.find((o) => o.value === t.type)?.label ?? t.type}
                                  </span>
                                  {t.value && t.value !== "true" && (
                                    <>
                                      {": "}
                                      <code className="rounded bg-surface px-1 py-0.5">{t.value}</code>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-xl bg-surface-2 p-2.5">
                            <p className="mb-1 font-semibold text-muted uppercase">Then</p>
                            <ul className="flex flex-col gap-1">
                              {a.actions.map((act, idx) => (
                                <li key={act.id ?? idx} className="truncate">
                                  <span className="font-medium">
                                    {ACTION_OPTIONS.find((o) => o.value === act.type)?.label ?? act.type}
                                  </span>
                                  {act.value && (
                                    <>
                                      {": "}
                                      <code className="rounded bg-surface px-1 py-0.5">{act.value}</code>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={testRuleMut.isPending && testRuleMut.variables?.id === r.id}
                          onClick={() => testRuleMut.mutate(r)}
                          title="Preview transactions that match this rule"
                        >
                          <Eye className="size-4" aria-hidden /> Test
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={triggerRuleMut.isPending && triggerRuleMut.variables === r.id}
                          onClick={() => triggerRuleMut.mutate(r.id)}
                          title="Execute rule on transactions in the selected date range"
                        >
                          <Play className="size-3.5" aria-hidden /> Run
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRuleMut.mutate(r)}
                          title={a.active ? "Pause rule" : "Activate rule"}
                        >
                          <CheckCircle2 className={cn("size-4", a.active ? "text-success" : "text-muted")} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingRule(r);
                            setShowBuilder(true);
                          }}
                          aria-label={`Edit ${a.title}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => delRuleMut.mutate(r.id)}
                          aria-label={`Delete ${a.title}`}
                        >
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function RuleBuilderCard({
  groups,
  initial,
  accounts,
  categories,
  budgets,
  tags,
  bills,
  onClose,
}: {
  groups: Resource<RuleGroup>[];
  initial: Resource<Rule> | null;
  accounts: string[];
  categories: Array<Resource<Category>>;
  budgets: string[];
  tags: string[];
  bills: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const initAttr = initial?.attributes;

  const [title, setTitle] = useState(initAttr?.title ?? "");
  const [description, setDescription] = useState(initAttr?.description ?? "");
  const [groupId, setGroupId] = useState(initAttr?.rule_group_id ?? String(groups[0]?.id ?? ""));
  const [groupTitle, setGroupTitle] = useState(groups.length === 0 ? "Default rules" : "");
  const [moment, setMoment] = useState<RuleMoment>(initAttr?.trigger ?? "store-journal");
  const [strict, setStrict] = useState(initAttr?.strict ?? true);
  const [stopProcessing, setStopProcessing] = useState(initAttr?.stop_processing ?? false);
  const [active, setActive] = useState(initAttr?.active ?? true);

  const [triggers, setTriggers] = useState<Array<{ type: string; value: string; prohibited: boolean }>>(
    initAttr?.triggers.length
      ? initAttr.triggers.map((t) => ({ type: t.type, value: t.value, prohibited: !!t.prohibited }))
      : [{ type: "description_contains", value: "", prohibited: false }],
  );

  const [actions, setActions] = useState<Array<{ type: string; value: string }>>(
    initAttr?.actions.length
      ? initAttr.actions.map((a) => ({ type: a.type, value: a.value ?? "" }))
      : [{ type: "set_category", value: "" }],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Enter a rule title.");
      let targetGroupId = groupId;
      if (!targetGroupId && groupTitle.trim()) {
        const created = await api.createRuleGroup(groupTitle.trim());
        targetGroupId = String(created.data.id);
      }
      if (!targetGroupId) throw new Error("Select or create a rule group.");

      const payload: RulePayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        rule_group_id: targetGroupId,
        trigger: moment,
        strict,
        stop_processing: stopProcessing,
        active,
        triggers: triggers.map((t) => {
          const meta = TRIGGER_OPTIONS.find((o) => o.value === t.type);
          return {
            type: t.type,
            value: meta && !meta.needsValue ? "true" : t.value.trim(),
            prohibited: t.prohibited,
            active: true,
            stop_processing: false,
          };
        }),
        actions: actions.map((a) => {
          const meta = ACTION_OPTIONS.find((o) => o.value === a.type);
          return {
            type: a.type,
            value: meta && !meta.needsValue ? null : a.value.trim(),
            active: true,
            stop_processing: false,
          };
        }),
      };

      if (initial) return api.updateRule(initial.id, payload);
      return api.createRule(payload);
    },
    onSuccess: () => {
      toast(initial ? "Rule updated" : "Rule created");
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["rule-groups"] });
      onClose();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <Card className="border-primary flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{initial ? `Edit Rule: ${initAttr?.title}` : "Create Automatic Rule"}</h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close builder">
          <X className="size-4" />
        </Button>
      </div>

      {/* Shared datalists for action values */}
      <datalist id="dl-categories">{categories.map((c) => <option key={c.id} value={c.attributes.name} />)}</datalist>
      <datalist id="dl-budgets">{budgets.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-tags">{tags.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-accounts">{accounts.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-bills">{bills.map((n) => <option key={n} value={n} />)}</datalist>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Rule title" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Auto-categorize Talabat & Uber Eats"
                required
              />
            )}
          </Field>

          {groups.length > 0 ? (
            <Field label="Rule group">
              {(id) => (
                <Select id={id} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.attributes.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="New rule group title">
              {(id) => <Input id={id} value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} required />}
            </Field>
          )}

          <Field label="When to trigger">
            {(id) => (
              <Select id={id} value={moment} onChange={(e) => setMoment(e.target.value as RuleMoment)}>
                <option value="store-journal">When transaction is created</option>
                <option value="update-journal">When transaction is updated</option>
                <option value="manual-activation">Only when triggered manually</option>
              </Select>
            )}
          </Field>

          <Field label="Trigger matching mode">
            {(id) => (
              <Select id={id} value={strict ? "strict" : "any"} onChange={(e) => setStrict(e.target.value === "strict")}>
                <option value="strict">ALL triggers must match (AND)</option>
                <option value="any">ANY trigger can match (OR)</option>
              </Select>
            )}
          </Field>

          <Field label="Description (optional)">
            {(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
            Rule is active
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={stopProcessing}
              onChange={(e) => setStopProcessing(e.target.checked)}
              className="size-4"
            />
            Stop processing other rules in group after this rule matches
          </label>
        </div>

        {/* Triggers */}
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <CardTitle>Triggers (IF)</CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setTriggers((t) => [...t, { type: "description_contains", value: "", prohibited: false }])}
            >
              <Plus className="size-3.5" aria-hidden /> Add condition
            </Button>
          </div>
          {triggers.map((t, i) => {
            const meta = TRIGGER_OPTIONS.find((o) => o.value === t.type);
            const needsValue = meta ? meta.needsValue : true;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={t.prohibited}
                    onChange={(e) =>
                      setTriggers((list) => list.map((x, idx) => (idx === i ? { ...x, prohibited: e.target.checked } : x)))
                    }
                    className="size-3.5"
                  />
                  NOT
                </label>
                <Select
                  value={t.type}
                  onChange={(e) =>
                    setTriggers((list) => list.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)))
                  }
                  className="w-60"
                  aria-label="Trigger type"
                >
                  {TRIGGER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                {needsValue &&
                  (t.type === "category_is" ? (
                    <CategoryCascadeSelect
                      compact
                      categories={categories}
                      value={t.value}
                      onChange={(val) =>
                        setTriggers((list) => list.map((x, idx) => (idx === i ? { ...x, value: val } : x)))
                      }
                    />
                  ) : (
                    <Input
                      value={t.value}
                      onChange={(e) =>
                        setTriggers((list) => list.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))
                      }
                      placeholder={meta?.hint ?? "Match value…"}
                      className="min-w-48 flex-1"
                      required
                    />
                  ))}
                {triggers.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setTriggers((list) => list.filter((_, idx) => idx !== i))}
                    aria-label="Remove trigger"
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <CardTitle>Actions (THEN)</CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setActions((a) => [...a, { type: "set_category", value: "" }])}
            >
              <Plus className="size-3.5" aria-hidden /> Add action
            </Button>
          </div>
          {actions.map((a, i) => {
            const meta = ACTION_OPTIONS.find((o) => o.value === a.type);
            const needsValue = meta ? meta.needsValue : true;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  value={a.type}
                  onChange={(e) =>
                    setActions((list) => list.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)))
                  }
                  className="w-64"
                  aria-label="Action type"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                {needsValue &&
                  (a.type === "set_category" ? (
                    <CategoryCascadeSelect
                      compact
                      categories={categories}
                      value={a.value}
                      onChange={(val) =>
                        setActions((list) => list.map((x, idx) => (idx === i ? { ...x, value: val } : x)))
                      }
                    />
                  ) : (
                    <Input
                      value={a.value}
                      list={meta?.datalist ? `dl-${meta.datalist}` : undefined}
                      onChange={(e) =>
                        setActions((list) => list.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))
                      }
                      placeholder={meta?.hint ?? "Action value…"}
                      className="min-w-48 flex-1"
                      required
                    />
                  ))}
                {actions.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setActions((list) => list.filter((_, idx) => idx !== i))}
                    aria-label="Remove action"
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saveMut.isPending}>
            {initial ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ============================================================================
// 2. RECURRING TRANSACTIONS
// ============================================================================

function RecurrencesSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const recQ = useQuery({ queryKey: ["recurrences"], queryFn: api.recurrences });
  const accountsQ = useAccounts("all");
  const categoriesQ = useQuery({ queryKey: ["categories-list"], queryFn: () => api.categories(), staleTime: 5 * 60_000 });

  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [txType, setTxType] = useState<"withdrawal" | "deposit" | "transfer">("withdrawal");
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [moment, setMoment] = useState("1"); // day of month (1..31), day of week (1..7), or YYYY-MM-DD
  const [firstDate, setFirstDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  });
  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState("");

  const assetAccounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => ASSET_LIKE.has(a.attributes.type) && a.attributes.active !== false),
    [accountsQ.data],
  );
  const defaultSourceId = sourceId || assetAccounts[0]?.id || "";
  const defaultDestId = destId || assetAccounts[1]?.id || assetAccounts[0]?.id || "";

  const createMut = useMutation({
    mutationFn: async () => {
      const parsedAmt = parseAmount(amount);
      if (!title.trim() || !parsedAmt) throw new Error("Enter a title and valid amount.");
      const srcAcc = assetAccounts.find((a) => a.id === defaultSourceId);
      if (!srcAcc) throw new Error("Choose an account.");

      const tx: Record<string, unknown> = {
        description: title.trim(),
        amount: parsedAmt,
        currency_code: srcAcc.attributes.currency_code,
        category_name: category.trim() || undefined,
      };
      if (txType === "withdrawal") {
        tx.source_id = srcAcc.id;
        tx.destination_name = counterparty.trim() || title.trim();
      } else if (txType === "deposit") {
        tx.destination_id = srcAcc.id;
        tx.source_name = counterparty.trim() || title.trim();
      } else {
        tx.source_id = srcAcc.id;
        tx.destination_id = defaultDestId;
      }

      return api.createRecurrence({
        type: txType,
        title: title.trim(),
        description: title.trim(),
        first_date: firstDate,
        apply_rules: true,
        active: true,
        repetitions: [
          {
            type: freq,
            moment: freq === "daily" ? "" : moment,
            skip: 0,
            weekend: 1,
          },
        ],
        transactions: [tx],
      });
    },
    onSuccess: () => {
      toast("Recurring transaction created");
      setShowNew(false);
      setTitle("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["recurrences"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const triggerMut = useMutation({
    mutationFn: (id: string) => api.triggerRecurrence(id),
    onSuccess: () => {
      toast("Recurring transaction triggered!");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteRecurrence(id),
    onSuccess: () => {
      toast("Recurring transaction deleted", "info");
      qc.invalidateQueries({ queryKey: ["recurrences"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const items = recQ.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowNew((s) => !s)}>
          <Plus className="size-4" aria-hidden /> New Recurring Transaction
        </Button>
      </div>

      {showNew && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
            className="grid gap-3 sm:grid-cols-3"
          >
            <Field label="Title / Description">
              {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Rent" required />}
            </Field>
            <Field label="Type">
              {(id) => (
                <Select id={id} value={txType} onChange={(e) => setTxType(e.target.value as typeof txType)}>
                  <option value="withdrawal">Expense</option>
                  <option value="deposit">Income</option>
                  <option value="transfer">Transfer</option>
                </Select>
              )}
            </Field>
            <Field label="Amount">
              {(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.000" required />}
            </Field>

            <Field label={txType === "deposit" ? "Destination account" : "Source account"}>
              {(id) => (
                <Select id={id} value={defaultSourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.attributes.name} ({a.attributes.currency_code})
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {txType === "transfer" ? (
              <Field label="Destination account">
                {(id) => (
                  <Select id={id} value={defaultDestId} onChange={(e) => setDestId(e.target.value)}>
                    {assetAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.attributes.name} ({a.attributes.currency_code})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label={txType === "withdrawal" ? "Merchant / Payee" : "Payer"}>
                {(id) => <Input id={id} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Optional" />}
              </Field>
            )}

            <div className="sm:col-span-2">
              <CategoryCascadeSelect
                categories={categoriesQ.data}
                value={category}
                onChange={setCategory}
              />
            </div>

            <Field label="Frequency">
              {(id) => (
                <Select
                  id={id}
                  value={freq}
                  onChange={(e) => {
                    const next = e.target.value as typeof freq;
                    setFreq(next);
                    if (next === "monthly") setMoment("1");
                    if (next === "weekly") setMoment("1");
                    if (next === "yearly") setMoment(firstDate);
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              )}
            </Field>

            {freq !== "daily" && (
              <Field label={freq === "monthly" ? "Day of month (1-31)" : freq === "weekly" ? "Day of week (1=Mon..7=Sun)" : "Date (YYYY-MM-DD)"}>
                {(id) => <Input id={id} value={moment} onChange={(e) => setMoment(e.target.value)} required />}
              </Field>
            )}

            <Field label="First occurrence (must be in future)">
              {(id) => <Input id={id} type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} required />}
            </Field>

            <div className="flex items-end justify-end gap-2 sm:col-span-3">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMut.isPending}>
                Create schedule
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ErrorBox error={recQ.error} />

      <Card>
        {recQ.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No recurring transactions yet" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((r: Resource<Recurrence>) => {
              const a = r.attributes;
              const tx = a.transactions?.[0];
              const rep = a.repetitions?.[0];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{a.title}</span>
                      <Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Active" : "Inactive"}</Badge>
                      <Badge tone="primary">{a.type}</Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {rep?.description || `${rep?.type ?? ""} (${rep?.moment ?? ""})`}
                      {tx && ` · ${tx.source_name ?? ""} → ${tx.destination_name ?? ""}`}
                      {a.first_date && ` · Starts ${formatDate(a.first_date)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {tx && (
                      <span className="font-semibold">
                        <Money
                          amount={tx.amount}
                          code={tx.currency_code}
                          decimals={tx.currency_decimal_places}
                          symbol={tx.currency_symbol}
                        />
                      </span>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={triggerMut.isPending && triggerMut.variables === r.id}
                      onClick={() => triggerMut.mutate(r.id)}
                      title="Create transaction now"
                    >
                      <Play className="size-3.5" aria-hidden /> Trigger now
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => delMut.mutate(r.id)} aria-label={`Delete ${a.title}`}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// 3. BILLS & SUBSCRIPTIONS
// ============================================================================

function BillsSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const month = useMemo(() => monthRange(0), []);
  const billsQ = useQuery({ queryKey: ["bills", month.start, month.end], queryFn: () => api.bills(month.start, month.end) });
  const currenciesQ = useCurrencies();
  const primaryQ = usePrimaryCurrency();

  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [code, setCode] = useState("");
  const [freq, setFreq] = useState<Bill["repeat_freq"]>("monthly");
  const [date, setDate] = useState(isoDate());
  const [createMatchingRule, setCreateMatchingRule] = useState(true);
  const [matchKeyword, setMatchKeyword] = useState("");

  const enabledCurrencies = (currenciesQ.data ?? []).filter((c) => c.attributes.enabled !== false);
  const selectedCode = code || primaryQ.data?.code || enabledCurrencies[0]?.attributes.code || "BHD";

  const createMut = useMutation({
    mutationFn: async () => {
      const min = parseAmount(minAmt);
      const max = parseAmount(maxAmt || minAmt);
      if (!name.trim() || !min || !max) throw new Error("Enter bill name and expected amount.");
      const billRes = await api.createBill({
        name: name.trim(),
        amount_min: min,
        amount_max: max,
        currency_code: selectedCode,
        date,
        repeat_freq: freq,
        skip: 0,
        active: true,
      });

      // Optionally create an automatic rule that links matching transactions to this bill
      if (createMatchingRule) {
        const groups = await api.ruleGroups();
        let groupId = groups[0]?.id;
        if (!groupId) {
          const g = await api.createRuleGroup("Bills & Subscriptions");
          groupId = g.data.id;
        }
        await api.createRule({
          title: `Auto-match bill: ${name.trim()}`,
          rule_group_id: String(groupId),
          trigger: "store-journal",
          strict: true,
          stop_processing: false,
          active: true,
          triggers: [
            {
              type: "description_contains",
              value: (matchKeyword.trim() || name.trim()),
              active: true,
            },
          ],
          actions: [
            {
              type: "link_to_bill",
              value: name.trim(),
              active: true,
            },
          ],
        });
      }
      return billRes;
    },
    onSuccess: () => {
      toast(createMatchingRule ? "Bill + automatic matching rule created!" : "Bill created");
      setShowNew(false);
      setName("");
      setMinAmt("");
      setMaxAmt("");
      setMatchKeyword("");
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteBill(id),
    onSuccess: () => {
      toast("Bill deleted", "info");
      qc.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const items = billsQ.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowNew((s) => !s)}>
          <Plus className="size-4" aria-hidden /> New Bill / Subscription
        </Button>
      </div>

      {showNew && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
            className="grid gap-3 sm:grid-cols-3"
          >
            <Field label="Bill name">
              {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electricity, Internet, Netflix" required />}
            </Field>
            <Field label="Min expected amount">
              {(id) => <Input id={id} inputMode="decimal" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="10.000" required />}
            </Field>
            <Field label="Max expected amount" hint="Leave blank if fixed amount">
              {(id) => <Input id={id} inputMode="decimal" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} placeholder={minAmt || "15.000"} />}
            </Field>
            <Field label="Currency">
              {(id) => (
                <Select id={id} value={selectedCode} onChange={(e) => setCode(e.target.value)}>
                  {enabledCurrencies.map((c) => (
                    <option key={c.id} value={c.attributes.code}>
                      {c.attributes.code} · {c.attributes.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Repeat frequency">
              {(id) => (
                <Select id={id} value={freq} onChange={(e) => setFreq(e.target.value as Bill["repeat_freq"])}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half-year">Every 6 months</option>
                  <option value="yearly">Yearly</option>
                </Select>
              )}
            </Field>
            <Field label="Bill date">
              {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />}
            </Field>

            <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 sm:col-span-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={createMatchingRule}
                  onChange={(e) => setCreateMatchingRule(e.target.checked)}
                  className="size-4"
                />
                Automatically create a Rule to link transactions matching this keyword
              </label>
              {createMatchingRule && (
                <Input
                  value={matchKeyword}
                  onChange={(e) => setMatchKeyword(e.target.value)}
                  placeholder={`Description contains (defaults to "${name || "bill name"}")`}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createMut.isPending}>
                Save bill
              </Button>
            </div>
          </form>
        </Card>
      )}

      <ErrorBox error={billsQ.error} />

      <Card>
        {billsQ.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No bills or subscriptions tracked yet" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((b: Resource<Bill>) => {
              const a = b.attributes;
              const paidThisPeriod = (a.paid_dates?.length ?? 0) > 0;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{a.name}</span>
                      <Badge tone={paidThisPeriod ? "success" : "warning"}>
                        {paidThisPeriod ? "Paid this period" : "Unpaid / Upcoming"}
                      </Badge>
                      <Badge tone="neutral">{a.repeat_freq}</Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {a.next_expected_match ? `Next expected: ${formatDate(a.next_expected_match)}` : `Started ${formatDate(a.date)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      <Money amount={a.amount_min} code={a.currency_code} decimals={a.currency_decimal_places} />
                      {a.amount_max !== a.amount_min && (
                        <>
                          {" – "}
                          <Money amount={a.amount_max} code={a.currency_code} decimals={a.currency_decimal_places} />
                        </>
                      )}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => delMut.mutate(b.id)} aria-label={`Delete ${a.name}`}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
