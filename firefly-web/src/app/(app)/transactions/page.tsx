import type { Metadata } from "next";
import { Suspense } from "react";
import { TransactionsClient } from "./transactions-client";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsClient />
    </Suspense>
  );
}
