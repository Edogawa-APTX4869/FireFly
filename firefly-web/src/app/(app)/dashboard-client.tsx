"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  Columns2,
  CreditCard,
  Eye,
  EyeOff,
  GripVertical,
  List,
  MoreVertical,
  PiggyBank,
  Plus,
  Repeat,
  SlidersHorizontal,
  Square,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/firefly/api";
import type { BasicSummary, ChartDataSet, Resource, SummaryEntry, TransactionGroup } from "@/lib/firefly/types";
import {
  CARD_CATALOG,
  CARD_GROUP_LABELS,
  CATALOG_BY_KEY,
  DEFAULT_DASHBOARD_PREFS,
  makeCard,
  type CardGroup,
  type DashboardCardConfig,
  type DashboardCardKey,
  type DashboardPreferences,
} from "@/lib/dashboard-cards";
import { ExtraCard, inPeriod, type ExtraCardContext } from "./dashboard-extra-cards";
import { useAccounts, usePrimaryCurrency, useRatesToPrimary } from "@/lib/hooks";
import { cn, isoDate, monthRange, sumDecimal } from "@/lib/utils";
import {
  COLOR_PALETTE,
  inferAccountDefaultStyle,
  ResourceIconBadge,
  useResourceMeta,
} from "@/components/resource-icon";
import { TransactionRow } from "@/components/transaction-row";
import {
  AnimatedMoney,
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorBox,
  ModalSheet,
  Money,
  Progress,
  Select,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/providers";

function extractSummaryByPrefix(summary: BasicSummary | undefined, prefix: string): SummaryEntry[] {
  if (!summary) return [];
  return Object.entries(summary)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v)
    .filter((v) => v && v.currency_code);
}

function normaliseChartEntries(ds: ChartDataSet): Array<{ date: string; value: number }> {
  const entries = ds.entries;
  if (!entries) return [];
  if (Array.isArray(entries)) {
    return entries.map((e, i) => ({
      date: (e.date || e.key || String(i)).slice(0, 10),
      value: Number(e.value) || 0,
    }));
  }
  return Object.entries(entries).map(([k, v]) => ({
    date: k.slice(0, 10),
    value: Number(v) || 0,
  }));
}

export function DashboardClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const today = isoDate();
  const currentMonth = useMemo(() => monthRange(0), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  }, []);

  const [topTab, setTopTab] = useState<"accounts" | "budgets">("accounts");
  const [dragKey, setDragKey] = useState<DashboardCardKey | null>(null);
  const [configOpenKey, setConfigOpenKey] = useState<DashboardCardKey | null>(null);
  const [showCardManager, setShowCardManager] = useState(false);

  const meta = useResourceMeta();
  const primaryQ = usePrimaryCurrency();
  const accountsQ = useAccounts("all");

  // Load persisted dashboard preferences (selected accounts + card order/config)
  const prefsQ = useQuery({
    queryKey: ["dashboard-prefs"],
    queryFn: async () => {
      const res = await fetch("/api/companion/dashboard");
      if (!res.ok) return DEFAULT_DASHBOARD_PREFS;
      const json = (await res.json()) as { data?: DashboardPreferences };
      return json.data ?? DEFAULT_DASHBOARD_PREFS;
    },
    staleTime: 60_000,
  });

  const savePrefsMut = useMutation({
    mutationFn: async (next: Partial<DashboardPreferences>) => {
      const res = await fetch("/api/companion/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Failed to save dashboard layout");
      return (await res.json()) as { data: DashboardPreferences };
    },
    onSuccess: (res) => {
      qc.setQueryData(["dashboard-prefs"], res.data);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const prefs = prefsQ.data ?? DEFAULT_DASHBOARD_PREFS;
  const selectedIds = useMemo(() => prefs.selectedAccountIds ?? [], [prefs.selectedAccountIds]);
  const cards = Array.isArray(prefs.cards) ? prefs.cards : DEFAULT_DASHBOARD_PREFS.cards;

  const summaryQ = useQuery({
    queryKey: ["dashboard", "summary", currentMonth.start, currentMonth.end],
    queryFn: () => api.summary(currentMonth.start, currentMonth.end),
    staleTime: 60_000,
  });

  // 6-month history
  const months = useMemo(() => [-5, -4, -3, -2, -1, 0].map((off) => monthRange(off)), []);
  const monthSummaries = useQueries({
    queries: months.map((m) => ({
      queryKey: ["dashboard", "summary", m.start, m.end],
      queryFn: () => api.summary(m.start, m.end),
      staleTime: 5 * 60_000,
    })),
  });

  const chartQ = useQuery({
    queryKey: ["dashboard", "account-chart", thirtyDaysAgo, today],
    queryFn: () => api.accountChart(thirtyDaysAgo, today),
    staleTime: 2 * 60_000,
  });

  const budgetsQ = useQuery({
    queryKey: ["budgets", currentMonth.start, currentMonth.end],
    queryFn: () => api.budgets(currentMonth.start, currentMonth.end),
    staleTime: 60_000,
  });
  const limitsQ = useQuery({
    queryKey: ["budget-limits", currentMonth.start, currentMonth.end],
    queryFn: () => api.budgetLimits(currentMonth.start, currentMonth.end),
    staleTime: 60_000,
  });
  const billsQ = useQuery({
    queryKey: ["bills", currentMonth.start, currentMonth.end],
    queryFn: () => api.bills(currentMonth.start, currentMonth.end),
    staleTime: 60_000,
  });
  const piggyQ = useQuery({
    queryKey: ["piggy-banks"],
    queryFn: api.piggyBanks,
    staleTime: 60_000,
  });

  // Fetch recent transactions (up to 50) so we can dynamically filter by selected accounts & compute Cash Flow Table
  const recentTxQ = useQuery({
    queryKey: ["transactions", "dashboard-pool"],
    queryFn: () => api.transactions(1, { limit: 250 }),
    staleTime: 30_000,
  });

  // Net-Worth asset accounts eligible for the Wallet grid:
  // Strictly excludes accounts not included in Net Worth and excludes liability/debt accounts completely.
  const walletAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter((a) => {
        if (a.attributes.active === false) return false;
        // User request: accounts excluded from net worth must not be shown in the accounts list
        if (a.attributes.include_net_worth === false) return false;

        // User request: liability accounts must specifically not be shown in the accounts list
        const type = String(a.attributes.type || "").toLowerCase();
        if (
          type.includes("liabilit") ||
          type.includes("loan") ||
          type.includes("debt") ||
          type.includes("mortgage") ||
          Boolean(a.attributes.liability_type) ||
          a.attributes.account_role === "ccAsset"
        ) {
          return false;
        }

        return type === "asset" || type === "cash" || type === "default";
      }),
    [accountsQ.data],
  );

  // Which accounts are currently selected for Net Worth, Gauges, Recent Records & Cash Flow
  const activeSelectedAccounts = useMemo(() => {
    if (selectedIds.length === 0) {
      return walletAccounts;
    }
    const set = new Set(selectedIds);
    return walletAccounts.filter((a) => set.has(a.id));
  }, [walletAccounts, selectedIds]);

  const selectedIdSet = useMemo(
    () => new Set(activeSelectedAccounts.map((a) => a.id)),
    [activeSelectedAccounts],
  );

  function toggleAccountSelection(id: string) {
    let nextIds: string[];
    if (selectedIds.length === 0) {
      // Switching from "all" to explicit multi-select: toggle this account out or solo-select it
      const allIds = walletAccounts.map((a) => a.id);
      nextIds = allIds.includes(id) ? allIds.filter((x) => x !== id) : [...allIds, id];
    } else if (selectedIds.includes(id)) {
      nextIds = selectedIds.filter((x) => x !== id);
    } else {
      nextIds = [...selectedIds, id];
    }
    savePrefsMut.mutate({ selectedAccountIds: nextIds });
  }

  function selectAllAccounts() {
    savePrefsMut.mutate({ selectedAccountIds: [] });
  }

  // Group balances by currency from currently selected accounts
  const balancesByCurrency = useMemo(() => {
    const map = new Map<string, { code: string; decimals: number; symbol?: string | null; total: Decimal }>();
    for (const acc of activeSelectedAccounts) {
      const code = acc.attributes.currency_code || "";
      if (!code) continue;
      const cur = map.get(code) ?? {
        code,
        decimals: acc.attributes.currency_decimal_places ?? 2,
        symbol: acc.attributes.currency_symbol,
        total: new Decimal(0),
      };
      cur.total = cur.total.plus(acc.attributes.current_balance ?? 0);
      map.set(code, cur);
    }
    return [...map.values()];
  }, [activeSelectedAccounts]);

  const allCurrencyCodes = useMemo(
    () => [...new Set(walletAccounts.map((a) => a.attributes.currency_code || "").filter(Boolean))],
    [walletAccounts],
  );
  const ratesToPrimaryQ = useRatesToPrimary(allCurrencyCodes, today);
  const primary = primaryQ.data;
  const primaryCode = primary?.code || balancesByCurrency[0]?.code || "BHD";
  const primaryDecimals = primary?.decimal_places ?? 3;

  // Convert any amount in `code` to `primaryCode`
  const toPrimary = useMemo(() => {
    return (amount: string | number | Decimal, code?: string | null): Decimal => {
      const d = new Decimal(amount || 0);
      if (!code || code === primaryCode) return d;
      const r = ratesToPrimaryQ.data?.[code];
      return r ? d.mul(r.rate) : d;
    };
  }, [primaryCode, ratesToPrimaryQ.data]);

  // Converted net worth of selected accounts in primary currency
  const selectedBalancePrimary = useMemo(() => {
    let total = new Decimal(0);
    for (const b of balancesByCurrency) {
      total = total.plus(toPrimary(b.total, b.code));
    }
    return total;
  }, [balancesByCurrency, toPrimary]);

  // Filter recent transactions by selected accounts
  const filteredTransactions = useMemo(() => {
    const allTx = recentTxQ.data?.data ?? [];
    if (selectedIds.length === 0) return allTx;
    return allTx.filter((g) => {
      const s = g.attributes.transactions[0];
      if (!s) return false;
      return (
        (s.source_id && selectedIdSet.has(String(s.source_id))) ||
        (s.destination_id && selectedIdSet.has(String(s.destination_id)))
      );
    });
  }, [recentTxQ.data, selectedIds.length, selectedIdSet]);

  // Compute Cash Flow Table & Gauge metrics for any given period (7, 30, or 90 days)
  function computeMetricsForPeriod(days: number) {
    // Next 7 days outlook from active unpaid bills
    let outlookNext7 = new Decimal(0);
    for (const b of billsQ.data ?? []) {
      if (!b.attributes.active) continue;
      const paid = (b.attributes.paid_dates?.length ?? 0) > 0;
      if (!paid) {
        const avgBill = new Decimal(b.attributes.amount_min || 0)
          .plus(b.attributes.amount_max || 0)
          .div(2);
        outlookNext7 = outlookNext7.minus(toPrimary(avgBill, b.attributes.currency_code).div(4));
      }
    }

    // Debt & Credit ratios across selected accounts
    let debtSum = new Decimal(0);
    let creditUsedSum = new Decimal(0);
    let positiveAssetSum = new Decimal(0);
    for (const acc of activeSelectedAccounts) {
      const bal = toPrimary(acc.attributes.current_balance ?? 0, acc.attributes.currency_code);
      if (bal.lt(0)) {
        debtSum = debtSum.plus(bal.abs());
        if (acc.attributes.account_role === "ccAsset" || String(acc.attributes.type).toLowerCase().includes("credit")) {
          creditUsedSum = creditUsedSum.plus(bal.abs());
        }
      } else {
        positiveAssetSum = positiveAssetSum.plus(bal);
      }
    }
    const debtPct = positiveAssetSum.gt(0)
      ? Math.min(100, Math.round(debtSum.div(positiveAssetSum).mul(100).toNumber()))
      : 0;
    const creditPct = positiveAssetSum.gt(0)
      ? Math.min(100, Math.round(creditUsedSum.div(positiveAssetSum).mul(100).toNumber()))
      : 0;

    let incomeCount = 0;
    let expenseCount = 0;
    let incomeSum = new Decimal(0);
    let expenseSum = new Decimal(0);

    const periodTxs = inPeriod(filteredTransactions, days);
    for (const g of periodTxs) {
      for (const s of g.attributes.transactions) {
        const amtPrimary = toPrimary(Math.abs(Number(s.amount || 0)), s.currency_code);
        if (s.type === "deposit") {
          incomeCount++;
          incomeSum = incomeSum.plus(amtPrimary);
        } else if (s.type === "withdrawal") {
          expenseCount++;
          expenseSum = expenseSum.plus(amtPrimary);
        }
      }
    }

    // If 30-day window and all accounts are selected, fall back to summaryQ if larger
    if (days === 30 && selectedIds.length === 0 && summaryQ.data) {
      const earnedEntries = extractSummaryByPrefix(summaryQ.data, "earned-in-");
      const spentEntries = extractSummaryByPrefix(summaryQ.data, "spent-in-");
      if (earnedEntries.length > 0 || spentEntries.length > 0) {
        let sumE = new Decimal(0);
        let sumS = new Decimal(0);
        for (const e of earnedEntries) sumE = sumE.plus(toPrimary(Math.abs(Number(e.monetary_value)), e.currency_code));
        for (const s of spentEntries) sumS = sumS.plus(toPrimary(Math.abs(Number(s.monetary_value)), s.currency_code));
        if (sumE.gt(incomeSum)) incomeSum = sumE;
        if (sumS.gt(expenseSum)) expenseSum = sumS;
      }
    }

    const netCashflow = incomeSum.minus(expenseSum);
    const safeDays = Math.max(1, days);
    return {
      days: safeDays,
      incomeCount,
      expenseCount,
      incomeSum,
      expenseSum,
      netCashflow,
      avgIncomeDay: incomeSum.div(safeDays),
      avgExpenseDay: expenseSum.div(safeDays),
      avgIncomeRec: incomeCount > 0 ? incomeSum.div(incomeCount) : new Decimal(0),
      avgExpenseRec: expenseCount > 0 ? expenseSum.div(expenseCount) : new Decimal(0),
      outlookNext7,
      debtPct,
      creditPct,
    };
  }

  // 6-month bar chart data
  const barData = months.map((m, i) => {
    const s = monthSummaries[i]?.data;
    const earned = extractSummaryByPrefix(s, "earned-in-").find((e) => e.currency_code === primaryCode);
    const spent = extractSummaryByPrefix(s, "spent-in-").find((e) => e.currency_code === primaryCode);
    return {
      name: m.label,
      Income: Math.abs(Number(earned?.monetary_value ?? 0)),
      Expense: Math.abs(Number(spent?.monetary_value ?? 0)),
    };
  });

  // Account overview area chart (filtered by selected account names when applicable)
  const selectedNamesSet = useMemo(
    () => new Set(activeSelectedAccounts.map((a) => a.attributes.name.toLowerCase())),
    [activeSelectedAccounts],
  );
  const sets = chartQ.data ?? [];
  const chosenSets = sets.filter((s) => selectedNamesSet.has((s.label || "").toLowerCase()));
  const effectiveSets = chosenSets.length > 0 ? chosenSets : sets;
  const byDate = new Map<string, number>();
  for (const ds of effectiveSets) {
    for (const pt of normaliseChartEntries(ds)) {
      byDate.set(pt.date, (byDate.get(pt.date) ?? 0) + pt.value);
    }
  }
  const trendData = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, balance]) => ({
      date: date.slice(5),
      Balance: Math.round(balance * 100) / 100,
    }));

  // Budgets progress
  const activeBudgets = (budgetsQ.data ?? []).filter((b) => b.attributes.active);
  const limitsList = limitsQ.data ?? [];
  const budgetRows = activeBudgets
    .map((b) => {
      const lim = limitsList.find((l) => l.attributes.budget_id === b.id);
      const limitAmt = Number(lim?.attributes.amount ?? b.attributes.auto_budget_amount ?? 0);
      const spentArr = b.attributes.spent ?? [];
      const spentAmt = sumDecimal(spentArr.map((s) => Math.abs(Number(s.sum)))).toNumber();
      const code =
        lim?.attributes.currency_code ||
        spentArr[0]?.currency_code ||
        b.attributes.auto_budget_currency_code ||
        primaryCode;
      const decimals =
        lim?.attributes.currency_decimal_places ??
        spentArr[0]?.currency_decimal_places ??
        primaryDecimals;
      return { id: b.id, name: b.attributes.name, spent: spentAmt, limit: limitAmt, code, decimals };
    })
    .filter((r) => r.limit > 0 || r.spent > 0);

  // Reorder cards helper (drag-and-drop + up/down buttons)
  function moveCard(fromKey: DashboardCardKey, toKey: DashboardCardKey) {
    if (fromKey === toKey) return;
    const list = [...cards];
    const fromIdx = list.findIndex((c) => c.key === fromKey);
    const toIdx = list.findIndex((c) => c.key === toKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    savePrefsMut.mutate({ cards: list });
  }

  function stepCardOrder(key: DashboardCardKey, dir: -1 | 1) {
    const list = [...cards];
    const idx = list.findIndex((c) => c.key === key);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(target, 0, moved);
    savePrefsMut.mutate({ cards: list });
  }

  function updateCardConfig(key: DashboardCardKey, patch: Partial<DashboardCardConfig>) {
    const next = cards.map((c) => (c.key === key ? { ...c, ...patch } : c));
    savePrefsMut.mutate({ cards: next });
  }

  function addCard(key: DashboardCardKey) {
    if (cards.some((c) => c.key === key)) {
      updateCardConfig(key, { visible: true });
    } else {
      savePrefsMut.mutate({ cards: [...cards, makeCard(key)] });
    }
    toast(`Added “${CATALOG_BY_KEY.get(key)?.title ?? key}”`, "success");
  }

  function removeCard(key: DashboardCardKey) {
    savePrefsMut.mutate({ cards: cards.filter((c) => c.key !== key) });
    setConfigOpenKey(null);
  }

  function resetCards() {
    savePrefsMut.mutate({ cards: DEFAULT_DASHBOARD_PREFS.cards });
  }

  const shownKeys = new Set(cards.filter((c) => c.visible).map((c) => c.key));
  const availableCards = CARD_CATALOG.filter((c) => !shownKeys.has(c.key));

  const extraCtx: ExtraCardContext = {
    transactions: filteredTransactions,
    allTransactions: recentTxQ.data?.data ?? [],
    accounts: activeSelectedAccounts,
    allAccounts: accountsQ.data ?? [],
    toPrimary,
    primaryCode,
    primaryDecimals,
    primarySymbol: primary?.symbol,
    balancesByCurrency,
    bills: billsQ.data ?? [],
    piggies: piggyQ.data ?? [],
    barData,
    trendData,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header: title + net worth of the selected accounts + segmented switch */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted">
            Net worth · {activeSelectedAccounts.length} of {walletAccounts.length} accounts
          </p>
          <p className="tabular text-3xl font-semibold tracking-tight">
            <Money
              amount={selectedBalancePrimary.toFixed(primaryDecimals)}
              code={primaryCode}
              decimals={primaryDecimals}
              symbol={primary?.symbol}
              animated
            />
          </p>
        </div>
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:w-72">
          {(
            [
              { key: "accounts", label: "Accounts" },
              { key: "budgets", label: "Budgets & Goals" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={topTab === t.key}
              onClick={() => setTopTab(t.key)}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors",
                topTab === t.key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>


      <ErrorBox error={accountsQ.error || summaryQ.error} />

      {/* Top Panel: My Accounts in Wallet (Multi-Select Tiles) OR Budgets & Goals */}
      {topTab === "accounts" ? (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">My accounts</h2>
              <p className="text-xs text-muted">
                Tap to include or exclude from net worth and cards
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={selectAllAccounts}>
                  Select all
                </Button>
              )}
              <Link
                href="/accounts"
                aria-label="Open full accounts list"
                className="flex size-8 items-center justify-center rounded-full border border-border text-primary hover:bg-surface-2"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>

          {accountsQ.isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {walletAccounts.map((acc, idx) => {
                const isSelected = selectedIdSet.has(acc.id);
                const customMeta = meta.get("account", acc.id);
                const inferred = inferAccountDefaultStyle(acc.attributes, idx);
                const bg = customMeta?.color || inferred.color || COLOR_PALETTE[idx % COLOR_PALETTE.length];
                return (
                  <div
                    key={acc.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleAccountSelection(acc.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleAccountSelection(acc.id)}
                    aria-pressed={isSelected}
                    style={
                      isSelected
                        ? {
                            borderColor: bg,
                            borderLeftWidth: "4px",
                            backgroundColor: `${bg}14`,
                          }
                        : undefined
                    }
                    className={cn(
                      "group relative flex cursor-pointer flex-col justify-between gap-1.5 rounded-xl border p-2 sm:p-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none min-w-0 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97]",
                      isSelected
                        ? "shadow-xs ring-1 ring-primary/25"
                        : "border-border bg-surface opacity-55 grayscale-[30%] hover:opacity-90",
                    )}
                  >
                    {/* Animated Selected Check Badge */}
                    {isSelected && (
                      <span className="animate-pop-in absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-white shadow-xs">
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    )}

                    {/* Top Row: Editable Category-Aware Icon + Account Name + Register Link */}
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <ResourceIconBadge
                          entityType="account"
                          entityId={acc.id}
                          defaultIcon={inferred.icon}
                          defaultColor={bg}
                          size="sm"
                        />
                        <p className="truncate text-[11px] sm:text-xs font-semibold text-fg" title={acc.attributes.name}>
                          {acc.attributes.name}
                        </p>
                      </div>
                      <Link
                        href={`/accounts/${acc.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Open ${acc.attributes.name} transactions`}
                        aria-label={`Open ${acc.attributes.name} transactions`}
                        className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface/80 text-muted hover:border-primary hover:text-primary active:scale-90 transition-transform"
                      >
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </div>

                    {/* Bottom Row: Fully Responsive Unclipped Balance */}
                    <div className="min-w-0 overflow-hidden">
                      <p className="tabular font-mono text-[11px] sm:text-xs md:text-sm font-bold tracking-tight text-fg truncate">
                        <Money
                          amount={acc.attributes.current_balance ?? 0}
                          code={acc.attributes.currency_code}
                          decimals={acc.attributes.currency_decimal_places}
                          symbol={acc.attributes.currency_symbol}
                        />
                      </p>
                    </div>
                  </div>
                );
              })}

              <Link
                href="/accounts"
                className="flex min-h-16 items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 px-2 py-2 text-[11px] sm:text-xs font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-soft/40 active:translate-y-0 active:scale-[0.98]"
              >
                <span>Manage accounts</span>
                <Plus className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Link href="/transactions">
              <Button variant="secondary" size="sm" className="rounded-xl">
                <List className="size-4 text-primary" aria-hidden /> Records
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Budgets & Savings Goals</h2>
            <div className="flex gap-2">
              <Link href="/budgets">
                <Button variant="secondary" size="sm">Budgets</Button>
              </Link>
              <Link href="/piggy-banks">
                <Button variant="secondary" size="sm">Piggy Banks</Button>
              </Link>
            </div>
          </div>

          {budgetRows.length === 0 && (piggyQ.data?.length ?? 0) === 0 ? (
            <EmptyState title="No active budgets or piggy banks yet" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {budgetRows.map((b) => {
                const pct = b.limit > 0 ? Math.min(100, Math.round((b.spent / b.limit) * 100)) : 0;
                return (
                  <Link key={b.id} href="/budgets" className="rounded-xl border border-border p-3 hover:bg-surface-2">
                    <div className="mb-1 flex items-center justify-between text-sm font-semibold">
                      <span>{b.name}</span>
                      <Badge tone={pct >= 100 ? "danger" : "primary"}>{pct}%</Badge>
                    </div>
                    <p className="mb-2 text-xs text-muted">
                      <Money amount={b.spent} code={b.code} decimals={b.decimals} /> of{" "}
                      <Money amount={b.limit} code={b.code} decimals={b.decimals} />
                    </p>
                    <Progress value={pct} tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : "primary"} />
                  </Link>
                );
              })}
              {(piggyQ.data ?? []).map((p) => {
                const a = p.attributes;
                const cur = Number(a.current_amount || 0);
                const target = Number(a.target_amount || 0);
                const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0;
                return (
                  <Link key={p.id} href="/piggy-banks" className="rounded-xl border border-border p-3 hover:bg-surface-2">
                    <div className="mb-1 flex items-center justify-between text-sm font-semibold">
                      <span className="flex items-center gap-2">
                        <ResourceIconBadge entityType="piggy" entityId={p.id} defaultIcon="PiggyBank" size="sm" />
                        <span>{a.name}</span>
                      </span>
                      <Badge tone="success">{pct}%</Badge>
                    </div>
                    <p className="mb-2 text-xs text-muted">
                      Saved <Money amount={cur} code={a.currency_code} decimals={a.currency_decimal_places} />
                    </p>
                    <Progress value={pct} tone="success" />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Horizontal Quick-Action Pills (Planned payments, Debts, Budgets, Piggy Banks, Rules) */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
        <Link
          href="/rules?tab=recurrences"
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold shadow-2xs hover:bg-surface-2"
        >
          <Repeat className="size-3.5 text-warning" aria-hidden />
          Planned payments
        </Link>
        <a
          href="#card-liabilities"
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold shadow-2xs hover:bg-surface-2"
        >
          <CreditCard className="size-3.5 text-danger" aria-hidden />
          Debts & Liabilities
        </a>
        <Link
          href="/budgets"
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold shadow-2xs hover:bg-surface-2"
        >
          <TrendingUp className="size-3.5 text-success" aria-hidden />
          Budgets
        </Link>
        <Link
          href="/piggy-banks"
          className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold shadow-2xs hover:bg-surface-2"
        >
          <PiggyBank className="size-3.5 text-primary" aria-hidden />
          Savings Goals
        </Link>
      </div>

      {/* Draggable & Configurable Dashboard Cards (1 col on Mobile, 2-col Bento Grid on Desktop) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {cards
          .filter((c) => c.visible)
          .map((card, index, visibleList) => {
            const cardMetrics = computeMetricsForPeriod(card.periodDays);
            const span = card.span ?? CATALOG_BY_KEY.get(card.key)?.defaultSpan ?? 1;
            return (
              <div
                key={card.key}
                id={`card-${card.key}`}
                draggable
                onDragStart={() => setDragKey(card.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragKey) moveCard(dragKey, card.key);
                  setDragKey(null);
                }}
                className={cn(
                  "scroll-mt-6 transition-opacity",
                  span === 2 ? "lg:col-span-2" : "lg:col-span-1",
                  dragKey === card.key && "opacity-50",
                )}
              >
                <DashboardCardShell
                  card={card}
                  isFirst={index === 0}
                  isLast={index === visibleList.length - 1}
                  configOpen={configOpenKey === card.key}
                  onToggleConfig={() => setConfigOpenKey(configOpenKey === card.key ? null : card.key)}
                  onMoveUp={() => stepCardOrder(card.key, -1)}
                  onMoveDown={() => stepCardOrder(card.key, 1)}
                  onUpdate={(patch) => updateCardConfig(card.key, patch)}
                  onRemove={() => removeCard(card.key)}
                >
                  {card.key === "gauges" && (
                    <WalletGaugesCard
                      primaryCode={primaryCode}
                      primaryDecimals={primaryDecimals}
                      primarySymbol={primary?.symbol}
                      balance={selectedBalancePrimary}
                      cashflow={cardMetrics.netCashflow}
                      outlook={cardMetrics.outlookNext7}
                      spending={cardMetrics.expenseSum.negated()}
                      income={cardMetrics.incomeSum}
                      creditPct={cardMetrics.creditPct}
                      debtPct={cardMetrics.debtPct}
                    />
                  )}

                  {card.key === "recent_records" && (
                    <RecentRecordsCard
                      transactions={inPeriod(filteredTransactions, card.periodDays).slice(0, card.recordLimit || 5)}
                      periodDays={card.periodDays}
                    />
                  )}

                  {card.key === "cashflow_table" && (
                    <CashFlowTableCard
                      primaryCode={primaryCode}
                      primaryDecimals={primaryDecimals}
                      periodDays={card.periodDays}
                      metrics={cardMetrics}
                    />
                  )}

                  {card.key === "charts" && (
                    <ChartsCard
                      primaryCode={primaryCode}
                      barData={barData}
                      trendData={trendData}
                      loadingTrend={chartQ.isLoading}
                    />
                  )}

                  {card.key === "budgets_goals" && (
                    <BudgetsGoalsCard budgetRows={budgetRows.slice(0, card.recordLimit || 5)} />
                  )}

                  <ExtraCard card={card} ctx={extraCtx} />
                </DashboardCardShell>
              </div>
            );
          })}
      </div>

      {/* Bottom "Add more cards / Customize Dashboard" bar + ModalSheet */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted">
          Showing <strong>{cards.filter((c) => c.visible).length}</strong> of <strong>{CARD_CATALOG.length}</strong> available dashboard cards
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowCardManager(true)}>
            <SlidersHorizontal className="size-4 text-primary" aria-hidden />
            Add more cards & rearrange
          </Button>
        </div>
      </Card>

      <ModalSheet
        open={showCardManager}
        onClose={() => setShowCardManager(false)}
        title="Customize Dashboard Cards"
        subtitle="Add, remove, reorder, or toggle cards on your dashboard"
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          {/* Active Cards Section */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wide uppercase text-muted">
                  Your Dashboard Layout
                </span>
                <Badge tone="primary">
                  {cards.filter((c) => c.visible).length} visible · {cards.length} total
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={resetCards}>
                Reset to default
              </Button>
            </div>

            {cards.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
                No cards on your dashboard yet — pick any card from the catalog below.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {cards.map((c, idx) => {
                const entry = CATALOG_BY_KEY.get(c.key);
                const span = c.span ?? entry?.defaultSpan ?? 1;
                return (
                  <div
                    key={c.key}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-2.5 transition-all sm:p-3",
                      !c.visible && "opacity-60 bg-surface-2/40",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">
                        #{idx + 1}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("text-sm font-semibold", !c.visible && "text-muted line-through")}>
                            {c.title}
                          </span>
                          {entry?.group && (
                            <Badge tone="neutral" className="text-[10px] uppercase">
                              {entry.group}
                            </Badge>
                          )}
                          <Badge tone={span === 2 ? "primary" : "neutral"} className="hidden sm:inline-flex text-[10px]">
                            {span === 2 ? "2 cols" : "1 col"}
                          </Badge>
                        </div>
                        {entry?.description && (
                          <p className="truncate text-xs text-muted">{entry.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hidden sm:inline-flex"
                        onClick={() => updateCardConfig(c.key, { span: span === 2 ? 1 : 2 })}
                        title={span === 2 ? "Switch to half width (1 col on desktop)" : "Switch to full width (2 cols on desktop)"}
                        aria-label="Toggle card width"
                      >
                        {span === 2 ? <Columns2 className="size-4" /> : <Square className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={idx === 0}
                        onClick={() => stepCardOrder(c.key, -1)}
                        aria-label="Move card up"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={idx === cards.length - 1}
                        onClick={() => stepCardOrder(c.key, 1)}
                        aria-label="Move card down"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateCardConfig(c.key, { visible: !c.visible })}
                        aria-label={c.visible ? "Hide card" : "Show card"}
                      >
                        {c.visible ? <Eye className="size-4 text-primary" /> : <EyeOff className="size-4 text-muted" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCard(c.key)}
                        aria-label="Remove card"
                      >
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Categorized Catalog of Available Cards */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Add More Cards ({availableCards.length} available)
            </p>
            {availableCards.length === 0 ? (
              <p className="text-xs text-muted">All available cards are already active in your dashboard.</p>
            ) : (
              (["overview", "spending", "charts", "planning"] as CardGroup[]).map((grp) => {
                const items = availableCards.filter((c) => c.group === grp);
                if (items.length === 0) return null;
                return (
                  <div key={grp} className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted">{CARD_GROUP_LABELS[grp]}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => addCard(c.key)}
                          className="flex items-start gap-2.5 rounded-xl border border-dashed border-primary/40 bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/30"
                        >
                          <Plus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{c.title}</span>
                            <span className="block text-xs text-muted">{c.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </ModalSheet>
    </div>
  );
}

// ============================================================================
// CARD SHELL WITH DRAG HANDLE & 3-DOT CONFIGURATION POPOVER
// ============================================================================

function DashboardCardShell({
  card,
  isFirst,
  isLast,
  configOpen,
  onToggleConfig,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
  children,
}: {
  card: DashboardCardConfig;
  isFirst: boolean;
  isLast: boolean;
  configOpen: boolean;
  onToggleConfig: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (patch: Partial<DashboardCardConfig>) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const entry = CATALOG_BY_KEY.get(card.key);
  const subtitle =
    card.key === "gauges"
      ? `Past ${card.periodDays} days performance, and outlook for next 7 days.`
      : entry?.usesPeriod
        ? `Last ${card.periodDays} days · ${entry.description}`
        : entry?.description;
  return (
    <Card className="relative flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="cursor-grab text-muted hover:text-fg active:cursor-grabbing"
            title="Drag to reorder card"
          >
            <GripVertical className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold">{card.title}</h2>
            <p className="text-xs text-muted">{subtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleConfig}
          aria-label={`Configure ${card.title}`}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      {configOpen && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {entry?.usesPeriod && (
              <>
                <label className="font-medium">Period:</label>
                <Select
                  value={String(card.periodDays)}
                  onChange={(e) => onUpdate({ periodDays: Number(e.target.value) as 7 | 30 | 90 })}
                  className="h-8 w-28 text-xs"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </Select>
              </>
            )}

            {entry?.usesLimit && (
              <>
                <label className="ml-2 font-medium">Rows:</label>
                <Select
                  value={String(card.recordLimit)}
                  onChange={(e) => onUpdate({ recordLimit: Number(e.target.value) })}
                  className="h-8 w-20 text-xs"
                >
                  <option value="5">5</option>
                  <option value="8">8</option>
                  <option value="12">12</option>
                </Select>
              </>
            )}

            <div className="hidden items-center gap-1.5 lg:flex">
              <label className="ml-2 font-medium">Width:</label>
              <Select
                value={String(card.span ?? entry?.defaultSpan ?? 1)}
                onChange={(e) => onUpdate({ span: Number(e.target.value) as 1 | 2 })}
                className="h-8 w-28 text-xs"
              >
                <option value="1">Half (1 col)</option>
                <option value="2">Full (2 cols)</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={isFirst} onClick={onMoveUp}>
              <ArrowUp className="size-3.5" /> Up
            </Button>
            <Button variant="ghost" size="sm" disabled={isLast} onClick={onMoveDown}>
              <ArrowDown className="size-3.5" /> Down
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onUpdate({ visible: false })}>
              <EyeOff className="size-3.5" /> Hide
            </Button>
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="size-3.5 text-danger" /> Remove
            </Button>
          </div>
        </div>
      )}

      {children}
    </Card>
  );
}

// ============================================================================
// 1. WALLET DASHBOARD GAUGES CARD
// ============================================================================

function SpeedometerGauge({
  label,
  valueText,
  numericValue,
  code,
  decimals,
  symbol,
  suffix,
  signed,
  ratio,
  size = "lg",
}: {
  label: string;
  valueText?: string;
  numericValue?: number;
  code?: string | null;
  decimals?: number | null;
  symbol?: string | null;
  suffix?: string;
  signed?: boolean;
  /** -1 (far left red) .. 0 (top middle) .. +1 (far right green) */
  ratio: number;
  size?: "lg" | "sm";
}) {
  const clamped = Math.max(-1, Math.min(1, ratio));
  // Angle in degrees from -120deg (left red) to +120deg (right green)
  const angle = clamped * 115;

  return (
    <div className="flex flex-col items-center min-w-0">
      <svg
        viewBox="0 0 120 94"
        className={cn(
          "overflow-visible h-auto",
          size === "lg" ? "w-full max-w-[115px] sm:max-w-[136px]" : "w-full max-w-[70px] sm:max-w-[86px]",
        )}
      >
        {/* Left Red Arc */}
        <path
          d="M 22 76 A 44 44 0 0 1 38 22"
          fill="none"
          stroke="var(--danger)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Top Orange Arc */}
        <path
          d="M 41 20 A 44 44 0 0 1 79 20"
          fill="none"
          stroke="var(--warning)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Right Green Arc */}
        <path
          d="M 82 22 A 44 44 0 0 1 98 76"
          fill="none"
          stroke="var(--success)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Needle with dynamic spring response */}
        <g
          className="gauge-needle"
          style={{
            transform: `translate(60px, 56px) rotate(${angle}deg)`,
          }}
        >
          <polygon points="-3.5,10 3.5,10 0,-36" fill="currentColor" className="text-fg" />
          <circle cx="0" cy="0" r="7" fill="currentColor" className="text-fg" />
        </g>
      </svg>
      <span className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted uppercase truncate max-w-full">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-bold truncate max-w-full text-center px-0.5",
          size === "lg" ? "text-sm sm:text-xl" : "text-xs sm:text-sm",
        )}
      >
        {numericValue !== undefined ? (
          code !== undefined ? (
            <AnimatedMoney
              amount={numericValue}
              code={code}
              decimals={decimals}
              symbol={symbol}
              signed={signed}
            />
          ) : (
            <AnimatedNumber value={numericValue} suffix={suffix} decimals={decimals ?? 0} />
          )
        ) : (
          valueText
        )}
      </span>
    </div>
  );
}

function WalletGaugesCard({
  primaryCode,
  primaryDecimals,
  primarySymbol,
  balance,
  cashflow,
  outlook,
  spending,
  income,
  creditPct,
  debtPct,
}: {
  primaryCode: string;
  primaryDecimals: number;
  primarySymbol?: string | null;
  balance: Decimal;
  cashflow: Decimal;
  outlook: Decimal;
  spending: Decimal;
  income: Decimal;
  creditPct: number;
  debtPct: number;
}) {
  const cashflowRatio = income.gt(0)
    ? cashflow.div(income).toNumber()
    : cashflow.gte(0)
      ? 0.6
      : -0.6;
  const spendingRatio = income.gt(0)
    ? Math.max(-1, Math.min(1, 0.5 - spending.abs().div(income).toNumber()))
    : -0.2;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface-2 py-1 text-center text-xs text-muted">
        Showing all amounts in base currency ({primaryCode} · {primaryDecimals} decimals).
      </div>

      {/* 2 Large Primary Gauges: BALANCE & CASH FLOW */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-1">
        <SpeedometerGauge
          size="lg"
          label="Balance"
          numericValue={balance.toNumber()}
          code={primaryCode}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          ratio={balance.gt(0) ? 0.85 : -0.8}
        />
        <SpeedometerGauge
          size="lg"
          label="Cash Flow"
          numericValue={cashflow.toNumber()}
          code={primaryCode}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          signed
          ratio={cashflowRatio}
        />
      </div>

      {/* 4 Mini Secondary Gauges: OUTLOOK, SPENDING, CREDIT, DEBT */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 border-t border-border pt-3 sm:grid-cols-4">
        <SpeedometerGauge
          size="sm"
          label="Outlook (7d)"
          numericValue={outlook.toNumber()}
          code={primaryCode}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          ratio={outlook.gte(0) ? 0.7 : -0.35}
        />
        <SpeedometerGauge
          size="sm"
          label="Spending"
          numericValue={spending.toNumber()}
          code={primaryCode}
          decimals={primaryDecimals}
          symbol={primarySymbol}
          ratio={spendingRatio}
        />
        <SpeedometerGauge
          size="sm"
          label="Credit"
          numericValue={creditPct}
          suffix="%"
          ratio={creditPct === 0 ? 0.85 : 0.85 - (creditPct / 100) * 1.7}
        />
        <SpeedometerGauge
          size="sm"
          label="Debt"
          numericValue={debtPct}
          suffix="%"
          ratio={debtPct === 0 ? 0.85 : 0.85 - (debtPct / 100) * 1.7}
        />
      </div>

      <div className="flex items-center justify-between pt-1 text-xs">
        <Link href="/transactions" className="font-semibold text-primary hover:underline">
          View all records →
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// 2. LAST RECORDS OVERVIEW CARD
// ============================================================================

function RecentRecordsCard({
  transactions,
  periodDays,
}: {
  transactions: Array<Resource<TransactionGroup>>;
  periodDays: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Last {periodDays} days</p>
      {transactions.length === 0 ? (
        <EmptyState title="No matching records for selected accounts" />
      ) : (
        <ul className="divide-y divide-border">
          {transactions.map((g) => (
            <TransactionRow key={g.id} group={g} />
          ))}
        </ul>
      )}
      <div className="pt-1">
        <Link href="/transactions" className="text-xs font-semibold text-primary hover:underline">
          Show more
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// 3. CASH FLOW TABLE CARD (Count, Average Day, Average Record, Total, Cash Flow)
// ============================================================================

function CashFlowTableCard({
  primaryCode,
  primaryDecimals,
  periodDays,
  metrics,
}: {
  primaryCode: string;
  primaryDecimals: number;
  periodDays: number;
  metrics: {
    incomeCount: number;
    expenseCount: number;
    incomeSum: Decimal;
    expenseSum: Decimal;
    netCashflow: Decimal;
    avgIncomeDay: Decimal;
    avgExpenseDay: Decimal;
    avgIncomeRec: Decimal;
    avgExpenseRec: Decimal;
  };
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Last {periodDays} days</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1.5 text-left font-medium">Quick overview</th>
              <th className="py-1.5 text-right font-medium">Income</th>
              <th className="py-1.5 text-right font-medium text-danger">Expenses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular">
            <tr className="bg-surface-2/60">
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 font-medium">Count</td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right">
                <AnimatedNumber value={metrics.incomeCount} />
              </td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right text-danger">
                <AnimatedNumber value={metrics.expenseCount} />
              </td>
            </tr>
            <tr>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 font-medium">Average (Day)</td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right">
                <Money animated amount={metrics.avgIncomeDay.toString()} code={primaryCode} decimals={primaryDecimals} />
              </td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right text-danger">
                -<Money animated amount={metrics.avgExpenseDay.toString()} code={primaryCode} decimals={primaryDecimals} />
              </td>
            </tr>
            <tr className="bg-surface-2/60">
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 font-medium">Average (Record)</td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right">
                <Money animated amount={metrics.avgIncomeRec.toString()} code={primaryCode} decimals={primaryDecimals} />
              </td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right text-danger">
                -<Money animated amount={metrics.avgExpenseRec.toString()} code={primaryCode} decimals={primaryDecimals} />
              </td>
            </tr>
            <tr>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 font-semibold">Total</td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right font-semibold">
                <Money animated amount={metrics.incomeSum.toString()} code={primaryCode} decimals={primaryDecimals} />
              </td>
              <td className="px-1.5 py-1 sm:px-2 sm:py-1.5 text-right font-semibold text-danger">
                -<Money animated amount={metrics.expenseSum.toString()} code={primaryCode} decimals={primaryDecimals} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-baseline justify-end gap-3 border-t border-border pt-2.5 text-sm">
        <span className="text-xs text-muted">Cash flow</span>
        <span className={cn("text-base font-bold", metrics.netCashflow.lt(0) ? "text-danger" : "text-fg")}>
          <Money animated amount={metrics.netCashflow.toString()} code={primaryCode} decimals={primaryDecimals} />
        </span>
      </div>

      <div>
        <Link href="/transactions" className="text-xs font-semibold text-primary hover:underline">
          Show more
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// 4. CHARTS CARD (Income vs Expense & Balance Trend)
// ============================================================================

function ChartsCard({
  primaryCode,
  barData,
  trendData,
  loadingTrend,
}: {
  primaryCode: string;
  barData: Array<{ name: string; Income: number; Expense: number }>;
  trendData: Array<{ date: string; Balance: number }>;
  loadingTrend: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <CardTitle>Income vs Expense (6 months · {primaryCode})</CardTitle>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderRadius: "0.75rem",
                  fontSize: "0.875rem",
                }}
              />
              <Bar dataKey="Income" fill="var(--success)" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out" />
              <Bar dataKey="Expense" fill="var(--danger)" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <CardTitle>Balance Trend (selected accounts)</CardTitle>
        {loadingTrend ? (
          <Skeleton className="h-56 w-full" />
        ) : trendData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted">No chart data available</div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderRadius: "0.75rem",
                    fontSize: "0.875rem",
                  }}
                />
                <Area type="monotone" dataKey="Balance" stroke="var(--primary)" strokeWidth={2} fill="url(#balFill)" isAnimationActive animationDuration={900} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 5. BUDGETS & GOALS CARD
// ============================================================================

function BudgetsGoalsCard({
  budgetRows,
}: {
  budgetRows: Array<{ id: string; name: string; spent: number; limit: number; code: string; decimals?: number }>;
}) {
  if (budgetRows.length === 0) {
    return (
      <EmptyState title="No active budgets this month">
        <Link href="/budgets" className="text-primary hover:underline">
          Set up a monthly budget
        </Link>
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {budgetRows.map((b) => {
        const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0;
        const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "primary";
        return (
          <div key={b.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{b.name}</span>
              <span className="text-xs text-muted">
                <Money amount={b.spent} code={b.code} decimals={b.decimals} />
                {b.limit > 0 && (
                  <>
                    {" / "}
                    <Money amount={b.limit} code={b.code} decimals={b.decimals} />
                  </>
                )}
              </span>
            </div>
            {b.limit > 0 && <Progress value={pct} tone={tone} />}
          </div>
        );
      })}
      <div className="pt-1">
        <Link href="/budgets" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          All budgets <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
