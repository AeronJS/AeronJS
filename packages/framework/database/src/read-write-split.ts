/**
 * @ventostack/database — 读写分离 / 多数据源切换
 * 提供写库路由、读库负载均衡与多数据源管理能力
 * 支持 round-robin 与 random 两种读库负载均衡策略
 */

import type { SqlExecutor } from "./database";

/**
 * 读写分离配置选项。
 */
export interface ReadWriteSplitOptions {
  /** 写库执行器 */
  writer: SqlExecutor;
  /** 读库执行器数组（可多个，用于负载均衡） */
  readers: SqlExecutor[];
  /** 负载均衡策略（默认 round-robin） */
  strategy?: "round-robin" | "random";
}

/**
 * 读写分离执行器接口。
 */
export interface ReadWriteSplitExecutor {
  /**
   * 读操作路由到读库。
   * @param sql — SQL 文本
   * @param params — 参数数组
   * @returns 查询结果
   */
  read(sql: string, params?: unknown[]): Promise<unknown[]>;
  /**
   * 写操作路由到写库。
   * @param sql — SQL 文本
   * @param params — 参数数组
   * @returns 查询结果
   */
  write(sql: string, params?: unknown[]): Promise<unknown[]>;
  /**
   * 自动路由（根据 SQL 判断读/写）。
   * @param sql — SQL 文本
   * @param params — 参数数组
   * @returns 查询结果
   */
  execute(sql: string, params?: unknown[]): Promise<unknown[]>;
  /** 获取当前读库索引 */
  currentReaderIndex(): number;
}

/** 判定为写操作的 SQL 关键字 */
const WRITE_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
];

/**
 * 判断 SQL 是否为写操作。
 * @param sql — SQL 文本
 * @returns 是否为写操作
 */
function isWriteQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return WRITE_KEYWORDS.some((kw) => trimmed.startsWith(kw));
}

/**
 * 创建读写分离执行器。
 * @param options — 读写分离配置
 * @returns ReadWriteSplitExecutor 实例
 */
export function createReadWriteSplit(options: ReadWriteSplitOptions): ReadWriteSplitExecutor {
  const { writer, readers, strategy = "round-robin" } = options;
  if (readers.length === 0) {
    throw new Error("At least one reader is required");
  }

  let currentIdx = 0;

  /**
   * 选择下一个读库执行器。
   * @returns SqlExecutor 实例
   */
  function nextReader(): SqlExecutor {
    if (strategy === "random") {
      return readers[Math.floor(Math.random() * readers.length)]!;
    }
    // round-robin
    const reader = readers[currentIdx % readers.length]!;
    currentIdx++;
    return reader;
  }

  return {
    async read(sql: string, params?: unknown[]): Promise<unknown[]> {
      const reader = nextReader();
      return reader(sql, params);
    },

    async write(sql: string, params?: unknown[]): Promise<unknown[]> {
      return writer(sql, params);
    },

    async execute(sql: string, params?: unknown[]): Promise<unknown[]> {
      if (isWriteQuery(sql)) {
        return writer(sql, params);
      }
      return this.read(sql, params);
    },

    currentReaderIndex(): number {
      return (currentIdx - 1 + readers.length) % readers.length;
    },
  };
}

/**
 * 多数据源配置选项。
 */
export interface MultiDataSourceOptions {
  /** 数据源映射（名称 → 执行器） */
  sources: Record<string, SqlExecutor>;
  /** 默认数据源名称（不指定时取第一个） */
  defaultSource?: string;
}

/**
 * 多数据源管理器接口。
 */
export interface MultiDataSource {
  /**
   * 获取指定数据源。
   * @param name — 数据源名称
   * @returns SQL 执行器
   */
  get(name: string): SqlExecutor;
  /** 获取默认数据源 */
  getDefault(): SqlExecutor;
  /** 获取所有数据源名称列表 */
  list(): string[];
  /**
   * 判断是否存在指定数据源。
   * @param name — 数据源名称
   * @returns 是否存在
   */
  has(name: string): boolean;
}

/**
 * 创建多数据源管理器。
 * @param options — 多数据源配置
 * @returns MultiDataSource 实例
 */
export function createMultiDataSource(options: MultiDataSourceOptions): MultiDataSource {
  const { sources, defaultSource } = options;
  const names = Object.keys(sources);
  if (names.length === 0) throw new Error("At least one data source is required");

  const defaultName = defaultSource ?? names[0]!;

  return {
    get(name: string): SqlExecutor {
      const source = sources[name];
      if (!source) throw new Error(`Data source not found: ${name}`);
      return source;
    },

    getDefault(): SqlExecutor {
      return sources[defaultName]!;
    },

    list(): string[] {
      return names;
    },

    has(name: string): boolean {
      return name in sources;
    },
  };
}
