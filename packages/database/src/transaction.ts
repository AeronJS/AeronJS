/**
 * @ventostack/database — 嵌套事务 / Savepoint 支持
 * 提供显式事务控制、隔离级别、只读模式与嵌套 Savepoint 能力
 * 嵌套事务通过 Savepoint 实现，支持深度追踪与活跃状态检测
 */

import type { SqlExecutor } from "./database";

/**
 * 事务选项。
 */
export interface TransactionOptions {
  /** 事务隔离级别 */
  isolation?: "read_uncommitted" | "read_committed" | "repeatable_read" | "serializable";
  /** 是否只读 */
  readOnly?: boolean;
}

/**
 * 事务管理器接口，支持嵌套事务（通过 Savepoint 实现）。
 */
export interface TransactionManager {
  /**
   * 开始事务。
   * @param options — 事务选项（隔离级别、只读等）
   */
  begin(options?: TransactionOptions): Promise<void>;
  /** 提交事务 */
  commit(): Promise<void>;
  /** 回滚事务 */
  rollback(): Promise<void>;
  /**
   * 创建 Savepoint。
   * @param name — Savepoint 名称
   */
  savepoint(name: string): Promise<void>;
  /**
   * 回滚到指定 Savepoint。
   * @param name — Savepoint 名称
   */
  rollbackTo(name: string): Promise<void>;
  /**
   * 释放 Savepoint。
   * @param name — Savepoint 名称
   */
  releaseSavepoint(name: string): Promise<void>;
  /**
   * 嵌套事务（自动使用 savepoint）。
   * @param fn — 接收 SQL 执行器的异步函数
   * @returns 函数返回值
   */
  nested<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  /** 获取当前事务深度（0 表示不在事务中） */
  depth(): number;
  /** 是否在活跃事务中 */
  isActive(): boolean;
}

/**
 * 创建事务管理器，支持嵌套事务（通过 Savepoint 实现）。
 * @param executor — SQL 执行器
 * @returns TransactionManager 实例
 */
export function createTransactionManager(executor: SqlExecutor): TransactionManager {
  let transactionDepth = 0;
  let active = false;
  const savepoints: string[] = [];

  return {
    async begin(options?: TransactionOptions): Promise<void> {
      if (transactionDepth === 0) {
        let sql = "BEGIN";
        if (options?.isolation) {
          const level = options.isolation.replace(/_/g, " ").toUpperCase();
          sql = `BEGIN ISOLATION LEVEL ${level}`;
        }
        if (options?.readOnly) {
          sql += " READ ONLY";
        }
        await executor(sql);
        active = true;
      } else {
        // 嵌套事务 → Savepoint
        const name = `sp_${transactionDepth}`;
        await executor(`SAVEPOINT ${name}`);
        savepoints.push(name);
      }
      transactionDepth++;
    },

    async commit(): Promise<void> {
      if (transactionDepth <= 0) throw new Error("No active transaction");
      transactionDepth--;
      if (transactionDepth === 0) {
        await executor("COMMIT");
        active = false;
        savepoints.length = 0;
      } else {
        const sp = savepoints.pop();
        if (sp) {
          await executor(`RELEASE SAVEPOINT ${sp}`);
        }
      }
    },

    async rollback(): Promise<void> {
      if (transactionDepth <= 0) throw new Error("No active transaction");
      transactionDepth--;
      if (transactionDepth === 0) {
        await executor("ROLLBACK");
        active = false;
        savepoints.length = 0;
      } else {
        const sp = savepoints.pop();
        if (sp) {
          await executor(`ROLLBACK TO SAVEPOINT ${sp}`);
        }
      }
    },

    async savepoint(name: string): Promise<void> {
      if (!active) throw new Error("No active transaction");
      await executor(`SAVEPOINT ${name}`);
      savepoints.push(name);
    },

    async rollbackTo(name: string): Promise<void> {
      if (!active) throw new Error("No active transaction");
      await executor(`ROLLBACK TO SAVEPOINT ${name}`);
    },

    async releaseSavepoint(name: string): Promise<void> {
      if (!active) throw new Error("No active transaction");
      await executor(`RELEASE SAVEPOINT ${name}`);
      const idx = savepoints.indexOf(name);
      if (idx !== -1) savepoints.splice(idx, 1);
    },

    async nested<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T> {
      await this.begin();
      try {
        const result = await fn(executor);
        await this.commit();
        return result;
      } catch (err) {
        await this.rollback();
        throw err;
      }
    },

    depth(): number {
      return transactionDepth;
    },

    isActive(): boolean {
      return active;
    },
  };
}
