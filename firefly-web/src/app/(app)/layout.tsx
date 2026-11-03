import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AppShell serverUrl={session.url}>{children}</AppShell>;
}
