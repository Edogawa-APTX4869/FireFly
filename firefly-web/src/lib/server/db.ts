import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "firefly-companion.sqlite");

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS resource_meta (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      hidden INTEGER NOT NULL DEFAULT 0,
      is_todo INTEGER NOT NULL DEFAULT 0,
      extra_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS transaction_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'Sparkles',
      color TEXT NOT NULL DEFAULT '#6366f1',
      type TEXT NOT NULL DEFAULT 'withdrawal',
      amount TEXT NOT NULL DEFAULT '',
      currency_code TEXT NOT NULL DEFAULT '',
      foreign_amount TEXT NOT NULL DEFAULT '',
      foreign_currency_code TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      source_name TEXT NOT NULL DEFAULT '',
      destination_id TEXT NOT NULL DEFAULT '',
      destination_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category_name TEXT NOT NULL DEFAULT '',
      budget_id TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  _db = db;
  return db;
}

export interface ResourceMetaRow {
  entity_type: string;
  entity_id: string;
  icon: string;
  color: string;
  hidden: boolean;
  is_todo: boolean;
  extra: Record<string, unknown>;
}

export interface TransactionTemplateRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: "withdrawal" | "deposit" | "transfer";
  amount: string;
  currency_code: string;
  foreign_amount: string;
  foreign_currency_code: string;
  source_id: string;
  source_name: string;
  destination_id: string;
  destination_name: string;
  description: string;
  category_name: string;
  budget_id: string;
  tags: string;
  notes: string;
  sort_order: number;
}

export function listResourceMeta(entityType?: string): ResourceMetaRow[] {
  const db = getDb();
  const rows = entityType
    ? (db
        .prepare("SELECT * FROM resource_meta WHERE entity_type = ?")
        .all(entityType) as Array<Record<string, unknown>>)
    : (db.prepare("SELECT * FROM resource_meta").all() as Array<Record<string, unknown>>);

  return rows.map((r) => ({
    entity_type: String(r.entity_type),
    entity_id: String(r.entity_id),
    icon: String(r.icon ?? ""),
    color: String(r.color ?? ""),
    hidden: Boolean(r.hidden),
    is_todo: Boolean(r.is_todo),
    extra: safeJson(String(r.extra_json ?? "{}"), {}),
  }));
}

export function upsertResourceMeta(input: {
  entity_type: string;
  entity_id: string;
  icon?: string;
  color?: string;
  hidden?: boolean;
  is_todo?: boolean;
  extra?: Record<string, unknown>;
}): ResourceMetaRow {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM resource_meta WHERE entity_type = ? AND entity_id = ?")
    .get(input.entity_type, input.entity_id) as Record<string, unknown> | undefined;

  const icon = input.icon !== undefined ? input.icon : String(existing?.icon ?? "");
  const color = input.color !== undefined ? input.color : String(existing?.color ?? "");
  const hidden = input.hidden !== undefined ? (input.hidden ? 1 : 0) : Number(existing?.hidden ?? 0);
  const is_todo = input.is_todo !== undefined ? (input.is_todo ? 1 : 0) : Number(existing?.is_todo ?? 0);
  const extra =
    input.extra !== undefined
      ? input.extra
      : safeJson<Record<string, unknown>>(String(existing?.extra_json ?? "{}"), {});

  db.prepare(
    `INSERT INTO resource_meta (entity_type, entity_id, icon, color, hidden, is_todo, extra_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       icon = excluded.icon,
       color = excluded.color,
       hidden = excluded.hidden,
       is_todo = excluded.is_todo,
       extra_json = excluded.extra_json,
       updated_at = datetime('now')`,
  ).run(input.entity_type, input.entity_id, icon, color, hidden, is_todo, JSON.stringify(extra));

  return {
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    icon,
    color,
    hidden: Boolean(hidden),
    is_todo: Boolean(is_todo),
    extra,
  };
}

export function listTemplates(): TransactionTemplateRow[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM transaction_templates ORDER BY sort_order ASC, created_at DESC")
    .all() as unknown as TransactionTemplateRow[];
  return rows;
}

export function saveTemplate(input: Omit<TransactionTemplateRow, "id" | "sort_order"> & { id?: string; sort_order?: number }): TransactionTemplateRow {
  const db = getDb();
  const id = input.id || crypto.randomUUID();
  const sort_order = input.sort_order ?? 0;

  db.prepare(
    `INSERT INTO transaction_templates (
      id, name, icon, color, type, amount, currency_code, foreign_amount, foreign_currency_code,
      source_id, source_name, destination_id, destination_name, description, category_name, budget_id, tags, notes, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      icon = excluded.icon,
      color = excluded.color,
      type = excluded.type,
      amount = excluded.amount,
      currency_code = excluded.currency_code,
      foreign_amount = excluded.foreign_amount,
      foreign_currency_code = excluded.foreign_currency_code,
      source_id = excluded.source_id,
      source_name = excluded.source_name,
      destination_id = excluded.destination_id,
      destination_name = excluded.destination_name,
      description = excluded.description,
      category_name = excluded.category_name,
      budget_id = excluded.budget_id,
      tags = excluded.tags,
      notes = excluded.notes,
      sort_order = excluded.sort_order`,
  ).run(
    id,
    input.name,
    input.icon || "Sparkles",
    input.color || "#6366f1",
    input.type || "withdrawal",
    input.amount || "",
    input.currency_code || "",
    input.foreign_amount || "",
    input.foreign_currency_code || "",
    input.source_id || "",
    input.source_name || "",
    input.destination_id || "",
    input.destination_name || "",
    input.description || "",
    input.category_name || "",
    input.budget_id || "",
    input.tags || "",
    input.notes || "",
    sort_order,
  );

  return {
    id,
    name: input.name,
    icon: input.icon || "Sparkles",
    color: input.color || "#6366f1",
    type: input.type || "withdrawal",
    amount: input.amount || "",
    currency_code: input.currency_code || "",
    foreign_amount: input.foreign_amount || "",
    foreign_currency_code: input.foreign_currency_code || "",
    source_id: input.source_id || "",
    source_name: input.source_name || "",
    destination_id: input.destination_id || "",
    destination_name: input.destination_name || "",
    description: input.description || "",
    category_name: input.category_name || "",
    budget_id: input.budget_id || "",
    tags: input.tags || "",
    notes: input.notes || "",
    sort_order,
  };
}

export function deleteTemplateById(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM transaction_templates WHERE id = ?").run(id);
}

export function getKv<T>(key: string, fallback: T): T {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM app_kv WHERE key = ?").get(key) as { value_json?: string } | undefined;
  if (!row?.value_json) return fallback;
  return safeJson(row.value_json, fallback);
}

export function setKv<T>(key: string, value: T): T {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_kv (key, value_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`,
  ).run(key, JSON.stringify(value));
  return value;
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
