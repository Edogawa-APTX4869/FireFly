import { NextRequest, NextResponse } from "next/server";
import { listResourceMeta, upsertResourceMeta } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const entityType = req.nextUrl.searchParams.get("entity_type") || undefined;
  return NextResponse.json({ data: listResourceMeta(entityType) });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = (await req.json()) as {
    entity_type?: string;
    entity_id?: string;
    icon?: string;
    color?: string;
    hidden?: boolean;
    is_todo?: boolean;
    extra?: Record<string, unknown>;
  };
  if (!body.entity_type || !body.entity_id) {
    return NextResponse.json({ error: "entity_type and entity_id are required" }, { status: 400 });
  }
  const row = upsertResourceMeta({
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    icon: body.icon,
    color: body.color,
    hidden: body.hidden,
    is_todo: body.is_todo,
    extra: body.extra,
  });
  return NextResponse.json({ data: row });
}
