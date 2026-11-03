import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsClient } from "./accounts-client";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsClient />
    </Suspense>
  );
}
