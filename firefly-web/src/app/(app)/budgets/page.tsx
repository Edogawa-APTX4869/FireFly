import type { Metadata } from "next";
import { BudgetsClient } from "./budgets-client";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return <BudgetsClient />;
}
