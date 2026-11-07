import { redirect } from "next/navigation";

export default function BillsRedirectPage() {
  redirect("/rules?tab=bills");
}
