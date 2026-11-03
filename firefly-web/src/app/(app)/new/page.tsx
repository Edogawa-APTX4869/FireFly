import { Suspense } from "react";
import type { Metadata } from "next";
import { NewTransaction } from "./new-transaction";

export const metadata: Metadata = { title: "New transaction" };

export default function NewPage() {
  return (
    <Suspense>
      <NewTransaction />
    </Suspense>
  );
}
