import { Database as SQLiteDB } from "bun:sqlite";
import { createDatabase, createMigrationRunner } from "@ventostack/database";
import type { SqlExecutor } from "@ventostack/database";
import { config } from "./config";
import { migrations } from "./migrations";

const dbPath = config.dbPath.startsWith("/")
  ? config.dbPath
  : `${import.meta.dir}/../${config.dbPath}`;

const sqlite = new SQLiteDB(dbPath);

export const executor: SqlExecutor = async (text, params) => {
  const stmt = sqlite.query(text);
  const result = params && params.length > 0 ? stmt.all(...(params as any[])) : stmt.all();
  return Array.isArray(result) ? result : [];
};

export const db = createDatabase({ executor });

export const migrationRunner = createMigrationRunner(executor);

export async function runMigrations(): Promise<void> {
  for (const migration of migrations) {
    migrationRunner.addMigration(migration);
  }
  await migrationRunner.up();
}
