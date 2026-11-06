"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftRight, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/firefly/api";
import type { Account } from "@/lib/firefly/types";
import { inferAccountDefaultStyle, ResourceIconBadge } from "@/components/resource-icon";
import { TransactionRow } from "@/components/transaction-row";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  ModalSheet,
  Money,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/providers";

export function AccountDetailClient({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const accQ = useQuery({
    queryKey: ["account", id],
    queryFn: () => api.account(id),
  });

  const txQ = useInfiniteQuery({
    queryKey: ["transactions", "account", id],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.accountTransactions(id, pageParam),
    getNextPageParam: (last) => {
      const p = last.meta?.pagination;
      return p && p.current_page < p.total_pages ? p.current_page + 1 : undefined;
    },
  });

  const delMut = useMutation({
    mutationFn: (txId: string) => api.deleteTransaction(txId),
    onSuccess: () => {
      toast("Transaction deleted", "info");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["account", id] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: Partial<Account>) => api.updateAccount(id, payload),
    onSuccess: () => {
      toast("Account updated successfully", "success");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["account", id] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  // Keyboard shortcut 'e' to quickly edit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setEditing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const a = accQ.data?.attributes;
  const inferred = a ? inferAccountDefaultStyle(a, Number(id) || 0) : { icon: "Landmark", color: "#6366f1" };
  const groups = txQ.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Back to accounts
        </Link>
      </div>

      {accQ.isLoading ? (
        <Skeleton className="h-24" />
      ) : a ? (
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              <ResourceIconBadge
                entityType="account"
                entityId={id}
                defaultIcon={inferred.icon}
                defaultColor={inferred.color}
                size="lg"
                editable
              />
              <span className="truncate">{a.name}</span>
            </div>
          }
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge>{a.account_role || a.type}</Badge>
              {a.currency_code && <Badge tone="primary">{a.currency_code}</Badge>}
              {a.iban && <span className="font-mono text-xs">IBAN: {a.iban}</span>}
              {a.account_number && <span className="font-mono text-xs">#{a.account_number}</span>}
              {a.include_net_worth === false && <Badge tone="warning">Excluded from net worth</Badge>}
              {a.active === false && <Badge tone="danger">Inactive</Badge>}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted">Current balance</p>
                <p className="text-2xl font-bold">
                  <Money
                    animated
                    amount={a.current_balance}
                    code={a.currency_code}
                    decimals={a.currency_decimal_places}
                    symbol={a.currency_symbol}
                  />
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
                title="Edit account details (Shortcut: E)"
              >
                <Pencil className="size-4" aria-hidden /> Edit
              </Button>
              <Link href="/new?type=transfer">
                <Button variant="secondary" size="sm">
                  <ArrowLeftRight className="size-4" aria-hidden /> Transfer
                </Button>
              </Link>
              <Link href="/new?type=withdrawal">
                <Button size="sm">
                  <Plus className="size-4" aria-hidden /> New
                </Button>
              </Link>
            </div>
          }
        />
      ) : null}

      <ErrorBox error={accQ.error || txQ.error} />

      <Card>
        {txQ.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState title="No transactions for this account yet" />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {groups.map((g) => (
                <TransactionRow
                  key={g.id}
                  group={g}
                  perspectiveAccountId={id}
                  onDelete={(txId) => delMut.mutate(txId)}
                />
              ))}
            </ul>
            {txQ.hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={txQ.isFetchingNextPage}
                  onClick={() => txQ.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Edit Account Modal */}
      {editing && a && (
        <EditAccountModal
          account={a}
          onClose={() => setEditing(false)}
          onSave={(payload) => updateMut.mutate(payload)}
          isSaving={updateMut.isPending}
        />
      )}
    </div>
  );
}

function EditAccountModal({
  account,
  onClose,
  onSave,
  isSaving,
}: {
  account: Account;
  onClose: () => void;
  onSave: (payload: Partial<Account>) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(account.name);
  const [role, setRole] = useState(account.account_role || "defaultAsset");
  const [iban, setIban] = useState(account.iban || "");
  const [accountNumber, setAccountNumber] = useState(account.account_number || "");
  const [active, setActive] = useState(account.active ?? true);
  const [includeNetWorth, setIncludeNetWorth] = useState(account.include_net_worth ?? true);
  const [notes, setNotes] = useState(account.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      account_role: role || undefined,
      iban: iban.trim() || undefined,
      account_number: accountNumber.trim() || undefined,
      active,
      include_net_worth: includeNetWorth,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <ModalSheet
      open
      onClose={onClose}
      title="Edit Account"
      subtitle={`Update settings for ${account.name}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Account name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Checking, Savings, Cash"
              required
              autoFocus
            />
          )}
        </Field>

        <Field label="Account role">
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="defaultAsset">Default asset account</option>
              <option value="savingAsset">Savings account</option>
              <option value="sharedAsset">Shared asset account</option>
              <option value="ccAsset">Credit card account</option>
              <option value="cashWalletAsset">Cash wallet</option>
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="IBAN">
            {(id) => (
              <Input
                id={id}
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="e.g. BH00ABCD0123456789"
              />
            )}
          </Field>
          <Field label="Account number">
            {(id) => (
              <Input
                id={id}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 100200300"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2/40 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            <span>Active account</span>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4 cursor-pointer rounded accent-primary"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
            <span>Include in net worth calculations</span>
            <input
              type="checkbox"
              checked={includeNetWorth}
              onChange={(e) => setIncludeNetWorth(e.target.checked)}
              className="size-4 cursor-pointer rounded accent-primary"
            />
          </label>
        </div>

        <Field label="Notes / description (optional)">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional information about this account…"
              className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          )}
        </Field>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" loading={isSaving}>
            Save changes
          </Button>
        </div>
      </form>
    </ModalSheet>
  );
}
