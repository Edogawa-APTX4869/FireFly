import { NextRequest, NextResponse } from "next/server";
import { deleteTemplateById, listTemplates, saveTemplate, type TransactionTemplateRow } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json({ data: listTemplates() });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = (await req.json()) as Partial<TransactionTemplateRow>;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }
  const saved = saveTemplate({
    id: body.id,
    name: body.name.trim(),
    icon: body.icon || "Sparkles",
    color: body.color || "#6366f1",
    type: body.type === "deposit" || body.type === "transfer" ? body.type : "withdrawal",
    amount: body.amount || "",
    currency_code: body.currency_code || "",
    foreign_amount: body.foreign_amount || "",
    foreign_currency_code: body.foreign_currency_code || "",
    source_id: body.source_id || "",
    source_name: body.source_name || "",
    destination_id: body.destination_id || "",
    destination_name: body.destination_name || "",
    description: body.description || "",
    category_name: body.category_name || "",
    budget_id: body.budget_id || "",
    tags: body.tags || "",
    notes: body.notes || "",
    sort_order: body.sort_order ?? 0,
  });
  return NextResponse.json({ data: saved });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteTemplateById(id);
  return NextResponse.json({ ok: true });
}
