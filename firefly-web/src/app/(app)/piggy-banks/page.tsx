import type { Metadata } from "next";
import { PiggyBanksClient } from "./piggy-banks-client";

export const metadata: Metadata = { title: "Piggy Banks" };

export default function PiggyBanksPage() {
  return <PiggyBanksClient />;
}
