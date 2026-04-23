/**
 * @ventostack/testing - Test Container 数据库隔离
 * 提供内存测试数据库与测试生命周期 Fixture，支持 SQL 执行、保存点、回滚与自动清理
 */

/** 测试容器配置选项 */
export interface TestContainerOptions {
  /** 数据库类型 */
  type: "postgres" | "mysql" | "sqlite";
  /** 初始化 SQL */
  initSQL?: string[];
  /** 自动清理 */
  autoCleanup?: boolean;
}

/** 测试数据库实例接口 */
export interface TestDatabase {
  /** 获取连接 URL */
  url(): string;
  /** 执行 SQL */
  execute(sql: string): Promise<void>;
  /** 获取查询结果 */
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** 创建 savepoint */
  savepoint(name: string): Promise<void>;
  /** 回滚到 savepoint */
  rollbackTo(name: string): Promise<void>;
  /** 重置数据库（清除所有数据） */
  reset(): Promise<void>;
  /** 清理并关闭 */
  cleanup(): Promise<void>;
}

/** 测试容器工厂接口 */
export interface TestContainerFactory {
  /** 创建测试数据库实例
   * @param options 测试容器配置选项（可选）
   * @returns 测试数据库实例 */
  create(options?: TestContainerOptions): TestDatabase;
}

/**
 * 创建内存测试数据库（SQLite 模式）
 * 用于单元测试的数据库隔离，基于内存 Map 模拟表与行数据
 * @param options 测试容器配置选项（可选）
 * @returns 测试数据库实例
 */
export function createTestDatabase(options?: TestContainerOptions): TestDatabase {
  const initSQL = options?.initSQL ?? [];
  const tables: Map<string, Array<Record<string, unknown>>> = new Map();
  let initialized = false;

  async function init(): Promise<void> {
    if (initialized) return;
    for (const sql of initSQL) {
      await execute(sql);
    }
    initialized = true;
  }

  async function execute(sql: string): Promise<void> {
    // 简化的 SQL 解析（仅支持基础 DDL/DML 用于测试）
    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith("CREATE TABLE")) {
      const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (match?.[1]) {
        tables.set(match[1], []);
      }
    } else if (trimmed.startsWith("DROP TABLE")) {
      const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
      if (match?.[1]) {
        tables.delete(match[1]);
      }
    } else if (trimmed.startsWith("TRUNCATE") || trimmed.startsWith("DELETE FROM")) {
      const match = sql.match(/(?:TRUNCATE|DELETE\s+FROM)\s+(\w+)/i);
      if (match?.[1]) {
        const rows = tables.get(match[1]);
        if (rows) rows.length = 0;
      }
    }
  }

  const savepoints = new Map<string, Map<string, Array<Record<string, unknown>>>>();

  return {
    url(): string {
      return "memory://test";
    },

    async execute(sql: string): Promise<void> {
      await init();
      await execute(sql);
    },

    async query<T = Record<string, unknown>>(_sql: string): Promise<T[]> {
      await init();
      return [] as T[];
    },

    async savepoint(name: string): Promise<void> {
      // 保存当前状态快照
      const snapshot = new Map<string, Array<Record<string, unknown>>>();
      for (const [table, rows] of tables) {
        snapshot.set(
          table,
          rows.map((r) => ({ ...r })),
        );
      }
      savepoints.set(name, snapshot);
    },

    async rollbackTo(name: string): Promise<void> {
      const snapshot = savepoints.get(name);
      if (!snapshot) throw new Error(`Savepoint not found: ${name}`);
      tables.clear();
      for (const [table, rows] of snapshot) {
        tables.set(
          table,
          rows.map((r) => ({ ...r })),
        );
      }
    },

    async reset(): Promise<void> {
      for (const [, rows] of tables) {
        rows.length = 0;
      }
      savepoints.clear();
    },

    async cleanup(): Promise<void> {
      tables.clear();
      savepoints.clear();
      initialized = false;
    },
  };
}

/**
 * 创建测试数据库包装器（用于 bun:test beforeEach/afterEach）
 * 每个测试用例开始时自动创建 savepoint，结束后回滚，实现测试间数据隔离
 * @param options 测试容器配置选项（可选）
 * @returns 包含 db、setup 和 teardown 的对象，可在测试框架中直接解构使用
 */
export function createTestDatabaseFixture(options?: TestContainerOptions): {
  /** 测试数据库实例 */
  db: TestDatabase;
  /** 测试前置钩子：创建 savepoint */
  setup(): Promise<void>;
  /** 测试后置钩子：回滚到 savepoint */
  teardown(): Promise<void>;
} {
  const db = createTestDatabase(options);

  return {
    db,
    async setup(): Promise<void> {
      await db.savepoint("test_start");
    },
    async teardown(): Promise<void> {
      await db.rollbackTo("test_start");
    },
  };
}
