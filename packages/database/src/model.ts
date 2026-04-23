/**
 * @ventostack/database — 模型定义
 * 提供无 class 的列类型工厂、模型定义函数与类型推导工具
 * 所有列类型均携带编译期类型信息，支持 nullable、default、primary 等约束
 */

/**
 * 列级选项，用于控制字段约束与行为。
 */
export interface ColumnOptions {
  /** 是否为主键 */
  primary?: boolean;
  /** 是否自增 */
  autoIncrement?: boolean;
  /** 是否唯一 */
  unique?: boolean;
  /** 是否允许为空 */
  nullable?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 长度限制（如 varchar 长度） */
  length?: number;
  /** 字段注释 */
  comment?: string;
  /** 枚举可选值（仅 enum 类型使用） */
  values?: readonly string[];
}

/**
 * 列定义，携带 TypeScript 类型信息。
 * @template T — 该列对应的 TypeScript 类型
 */
export interface ColumnDef<T = unknown> {
  /** 数据库类型名称（如 bigint、varchar、json 等） */
  type: string;
  /** 列选项（约束、默认值等） */
  options: ColumnOptions;
  /** 编译期类型标记（无运行时值，仅用于类型推导） */
  $type?: T;
}

/**
 * 模型级选项，控制表级行为。
 */
export interface ModelOptions {
  /** 表注释 */
  comment?: string;
  /** 是否启用软删除（自动维护 deleted_at） */
  softDelete?: boolean;
  /** 是否自动维护 created_at / updated_at */
  timestamps?: boolean;
}

/**
 * 从 ColumnDef 推断列的输出类型（处理 nullable）。
 * 若列允许为空，则推导为 V | null，否则为 V。
 * @template T — ColumnDef 类型
 */
export type InferColumnType<T extends ColumnDef> = T extends ColumnDef<infer V>
  ? T["options"] extends { nullable: true }
    ? V | null
    : V
  : unknown;

/**
 * 从 columns 对象推断整行类型。
 * @template T — Record<string, ColumnDef> 的列定义对象
 */
export type InferRowType<T extends Record<string, ColumnDef>> = {
  [K in keyof T]: T[K] extends ColumnDef ? InferColumnType<T[K]> : unknown;
};

/**
 * 模型定义，包含表名、列定义、选项与行类型标记。
 * @template T — 行类型（由 defineModel 自动推导）
 */
export interface ModelDefinition<T = Record<string, unknown>> {
  /** 数据库表名 */
  tableName: string;
  /** 列定义映射（字段名 → ColumnDef） */
  columns: Record<string, ColumnDef>;
  /** 模型级选项 */
  options: ModelOptions;
  /** 编译期行类型标记（无运行时值） */
  $type: T;
}

/**
 * 创建列定义对象。
 * @template T — 列的 TypeScript 类型
 * @param type — 数据库类型名称
 * @param opts — 列选项
 * @returns ColumnDef 对象
 */
function createColumnDef<T>(type: string, opts?: ColumnOptions): ColumnDef<T> {
  return { type, options: opts ?? {} };
}

/**
 * 列类型工厂，提供常用数据库类型的类型安全构造方法。
 */
export const column = {
  /** 64 位整型 */
  bigint(opts?: ColumnOptions): ColumnDef<bigint> {
    return createColumnDef<bigint>("bigint", opts);
  },
  /** 32 位整型 */
  int(opts?: ColumnOptions): ColumnDef<number> {
    return createColumnDef<number>("int", opts);
  },
  /** 变长字符串 */
  varchar(opts?: ColumnOptions): ColumnDef<string> {
    return createColumnDef<string>("varchar", opts);
  },
  /** 长文本 */
  text(opts?: ColumnOptions): ColumnDef<string> {
    return createColumnDef<string>("text", opts);
  },
  /** 布尔值 */
  boolean(opts?: ColumnOptions): ColumnDef<boolean> {
    return createColumnDef<boolean>("boolean", opts);
  },
  /** 时间戳 */
  timestamp(opts?: ColumnOptions): ColumnDef<Date> {
    return createColumnDef<Date>("timestamp", opts);
  },
  /**
   * JSON 列。
   * @template T — JSON 反序列化后的 TypeScript 类型
   */
  json<T = unknown>(opts?: ColumnOptions): ColumnDef<T> {
    return createColumnDef<T>("json", opts);
  },
  /**
   * 枚举列。
   * @template T — 枚举字符串字面量联合类型
   * @param opts — 必须包含 values 数组
   */
  enum<T extends string>(opts: ColumnOptions & { values: readonly T[] }): ColumnDef<T> {
    return createColumnDef<T>("enum", opts);
  },
  /**
   * 定点数（以字符串存储，避免浮点精度问题）。
   * @param opts — 可包含 precision（精度）与 scale（小数位）
   */
  decimal(opts?: ColumnOptions & { precision?: number; scale?: number }): ColumnDef<string> {
    return createColumnDef<string>("decimal", opts);
  },
};

/**
 * 定义数据模型。
 * @template T — 列定义对象类型（Record<string, ColumnDef>）
 * @param tableName — 数据库表名
 * @param columns — 列定义对象
 * @param options — 模型级选项（软删除、时间戳等）
 * @returns 携带完整行类型的 ModelDefinition
 */
export function defineModel<T extends Record<string, ColumnDef>>(
  tableName: string,
  columns: T,
  options?: ModelOptions,
): ModelDefinition<InferRowType<T>> {
  const resolvedOptions: ModelOptions = {
    softDelete: options?.softDelete ?? false,
    timestamps: options?.timestamps ?? true,
  };
  if (options?.comment) {
    resolvedOptions.comment = options.comment;
  }

  return {
    tableName,
    columns,
    options: resolvedOptions,
    $type: undefined as unknown as InferRowType<T>,
  };
}
