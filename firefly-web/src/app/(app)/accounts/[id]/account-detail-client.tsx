"use client";

import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftRight, Plus } from "lucide-react";
import { api } from "@/lib/firefly/api";
import { TransactionRow } from "@/components/transaction-row";
import { Badge, Button, Card, EmptyState, ErrorBox, Money, PageHeader, Skeleton } from "@/components/ui";
import { useToast } from "@/components/providers";

export function AccountDetailClient({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();

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

  const a = accQ.data?.attributes;
  const groups = txQ.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/accounts" className=" inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Back to accounts
        </Link>
      </div>

      {accQ.isLoading ? (
        <Skeleton className="h-24" />
      ) : a ? (
        <PageHeader
          title={a.name}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge>{a.type}</Badge>
              {a.currency_code && <Badge tone="primary">{a.currency_code}</Badge>}
              {a.iban && <span>IBAN: {a.iban}</span>}
              {a.account_number && <span>#{a.account_number}</span>}
            </span>
          }
          actions={
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-muted">Current balance</p>
                <p className="text-2xl font-bold">
                  <Money
                    amount={a.current_balance}
                    code={a.currency_code}
                    decimals={a.currency_decimal_places}
                    symbol={a.currency_symbol}
                  />
                </p>
              </div>
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
    </div>
  );
}
