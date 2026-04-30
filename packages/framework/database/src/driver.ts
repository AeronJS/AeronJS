/**
 * @ventostack/database — 驱动适配器
 * 提供 PostgreSQL / MySQL / SQLite / MSSQL 的方言抽象，统一占位符、标识符引用、分页、UPSERT 等差异
 * 所有适配器均实现 DriverAdapter 接口，屏蔽底层数据库差异
 */

/**
 * 支持的数据库驱动类型。
 */
export type DatabaseDriver = "postgresql" | "mysql" | "sqlite" | "mssql";

/**
 * 驱动连接配置。
 */
export interface DriverConfig {
  /** 驱动类型 */
  driver: DatabaseDriver;
  /** 主机地址 */
  host?: string;
  /** 端口 */
  port?: number;
  /** 数据库名 */
  database?: string;
  /** 用户名 */
  username?: string;
  /** 密码 */
  password?: string;
  /** 连接 URL */
  url?: string;
  /** 额外驱动选项 */
  options?: Record<string, unknown>;
}

/**
 * 驱动适配器接口，屏蔽不同数据库的 SQL 方言差异。
 */
export interface DriverAdapter {
  /** 驱动类型 */
  driver: DatabaseDriver;
  /**
   * 生成参数占位符。
   * @param index — 参数索引（从 1 开始）
   * @returns 对应驱动的占位符字符串
   */
  placeholder(index: number): string;
  /**
   * 引用标识符（表名、列名等）。
   * @param identifier — 原始标识符
   * @returns 带引号的标识符
   */
  quote(identifier: string): string;
  /**
   * 生成分页子句。
   * @param limit — 限制条数
   * @param offset — 偏移量
   * @returns 分页 SQL 片段
   */
  limitOffset(limit: number, offset: number): string;
  /**
   * 生成 RETURNING 子句。
   * @param fields — 要返回的字段列表
   * @returns RETURNING SQL 片段（不支持时返回空字符串）
   */
  returning(fields: string[]): string;
  /** 当前时间戳函数 */
  now(): string;
  /**
   * 生成 UPSERT（插入或更新）语句。
   * @param table — 表名
   * @param fields — 插入字段列表
   * @param conflictFields — 冲突检测字段列表
   * @returns UPSERT SQL 语句
   */
  upsert(table: string, fields: string[], conflictFields: string[]): string;
  /**
   * 布尔值字面量。
   * @param value — 布尔值
   * @returns 对应驱动的布尔字面量字符串
   */
  boolean(value: boolean): string;
}

/**
 * 创建 PostgreSQL 驱动适配器。
 * @returns DriverAdapter 实例
 */
function createPostgresAdapter(): DriverAdapter {
  return {
    driver: "postgresql",
    placeholder: (i) => `$${i}`,
    quote: (id) => `"${id}"`,
    limitOffset: (limit, offset) => `LIMIT ${limit} OFFSET ${offset}`,
    returning: (fields) => `RETURNING ${fields.join(", ")}`,
    now: () => "NOW()",
    upsert: (table, fields, conflict) =>
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(", ")}) ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET ${fields
        .filter((f) => !conflict.includes(f))
        .map((f) => `${f} = EXCLUDED.${f}`)
        .join(", ")}`,
    boolean: (v) => (v ? "TRUE" : "FALSE"),
  };
}

/**
 * 创建 MySQL 驱动适配器。
 * @returns DriverAdapter 实例
 */
function createMysqlAdapter(): DriverAdapter {
  return {
    driver: "mysql",
    placeholder: () => "?",
    quote: (id) => `\`${id}\``,
    limitOffset: (limit, offset) => `LIMIT ${limit} OFFSET ${offset}`,
    returning: () => "", // MySQL 不支持 RETURNING
    now: () => "NOW()",
    upsert: (table, fields) =>
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON DUPLICATE KEY UPDATE ${fields.map((f) => `${f} = VALUES(${f})`).join(", ")}`,
    boolean: (v) => (v ? "1" : "0"),
  };
}

/**
 * 创建 SQLite 驱动适配器。
 * @returns DriverAdapter 实例
 */
function createSqliteAdapter(): DriverAdapter {
  return {
    driver: "sqlite",
    placeholder: () => "?",
    quote: (id) => `"${id}"`,
    limitOffset: (limit, offset) => `LIMIT ${limit} OFFSET ${offset}`,
    returning: (fields) => `RETURNING ${fields.join(", ")}`,
    now: () => "datetime('now')",
    upsert: (table, fields, conflict) =>
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET ${fields
        .filter((f) => !conflict.includes(f))
        .map((f) => `${f} = EXCLUDED.${f}`)
        .join(", ")}`,
    boolean: (v) => (v ? "1" : "0"),
  };
}

/**
 * 创建 MSSQL 驱动适配器。
 * @returns DriverAdapter 实例
 */
function createMssqlAdapter(): DriverAdapter {
  return {
    driver: "mssql",
    placeholder: (i) => `@p${i}`,
    quote: (id) => `[${id}]`,
    limitOffset: (limit, offset) => `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    returning: (fields) => `OUTPUT ${fields.map((f) => `INSERTED.${f}`).join(", ")}`,
    now: () => "GETDATE()",
    upsert: (table, fields, conflict) =>
      `MERGE ${table} AS target USING (SELECT ${fields.map((_, i) => `@p${i + 1} AS ${fields[i]}`).join(", ")}) AS source ON (${conflict.map((f) => `target.${f} = source.${f}`).join(" AND ")}) WHEN MATCHED THEN UPDATE SET ${fields
        .filter((f) => !conflict.includes(f))
        .map((f) => `${f} = source.${f}`)
        .join(
          ", ",
        )} WHEN NOT MATCHED THEN INSERT (${fields.join(", ")}) VALUES (${fields.map((f) => `source.${f}`).join(", ")});`,
    boolean: (v) => (v ? "1" : "0"),
  };
}

/**
 * 根据驱动类型创建适配器。
 * @param driver — 数据库驱动类型
 * @returns 对应驱动的 DriverAdapter 实例
 */
export function createDriverAdapter(driver: DatabaseDriver): DriverAdapter {
  switch (driver) {
    case "postgresql":
      return createPostgresAdapter();
    case "mysql":
      return createMysqlAdapter();
    case "sqlite":
      return createSqliteAdapter();
    case "mssql":
      return createMssqlAdapter();
    default:
      throw new Error(`Unsupported database driver: ${driver}`);
  }
}
