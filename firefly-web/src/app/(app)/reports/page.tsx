import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportsClient } from "./reports-client";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Statistics & Reports | Firefly III",
  description: "BudgetBakers-inspired portfolio balance trends, cash-flow velocity, spending insights, and debt management.",
};

function ReportsLoadingFallback() {
  return (
    <div className="flex flex-col gap-5 pb-24 lg:pb-8 animate-pulse">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-4 w-96 rounded-lg" />
      </div>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-12 w-80 rounded-2xl" />
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsLoadingFallback />}>
      <ReportsClient />
    </Suspense>
  );
}
