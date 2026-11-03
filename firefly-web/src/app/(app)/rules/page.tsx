import type { Metadata } from "next";
import { Suspense } from "react";
import { RulesClient } from "./rules-client";

export const metadata: Metadata = { title: "Automation & Rules" };

export default function RulesPage() {
  return (
    <Suspense>
      <RulesClient />
    </Suspense>
  );
}
