/**
 * 数据库连接管理
 *
 * 提供两个 executor：
 * - 生产查询使用连接池（DB_POOL_SIZE 控制大小，默认 10）
 * - 迁移使用单连接（需要手动 BEGIN/COMMIT 事务控制）
 */

import { createDatabase, type Database, type SqlExecutor } from "@ventostack/database";
import { env } from "../config";
import { SQL } from "bun";

export interface DatabaseContext {
  db: Database;
  executor: SqlExecutor;
  /** 迁移专用单连接 executor */
  migrationExecutor: SqlExecutor;
  /** 关闭数据库连接 */
  close: () => Promise<void>;
}

/**
 * 从 Bun SQL 实例创建 SqlExecutor
 */
function sqlToExecutor(sql: { unsafe: (text: string, params?: unknown[]) => Promise<unknown> }): SqlExecutor {
  return async (text, params) => {
    const result = params && params.length > 0
      ? await sql.unsafe(text, params as any[])
      : await sql.unsafe(text);
    return Array.isArray(result) ? result : [];
  };
}

/**
 * 创建数据库连接
 */
export function createDatabaseConnection(): DatabaseContext {
  // 生产连接池 — 并发处理请求
  const pool = new SQL({ url: env.DATABASE_URL, max: env.DB_POOL_SIZE });
  const executor = sqlToExecutor(pool);

  // 迁移单连接 — 允许手动 BEGIN/COMMIT
  const migrationSql = new SQL({ url: env.DATABASE_URL, max: 1 });
  const migrationExecutor = sqlToExecutor(migrationSql);

  const db = createDatabase({ executor });

  return {
    db,
    executor,
    migrationExecutor,
    async close() {
      pool.close();
      migrationSql.close();
    },
  };
}
