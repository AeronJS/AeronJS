/**
 * @ventostack/testing - 测试数据工厂
 * 提供类型安全的测试数据生成、字段覆盖与序列/随机/UUID 辅助生成器
 */

/** 字段生成器类型：固定值或工厂函数 */
type FieldGenerator<T> = T | (() => T);

/** 工厂定义，描述每个字段的生成规则 */
export interface FactoryDefinition<T extends Record<string, unknown>> {
  /** 字段生成规则映射 */
  fields: { [K in keyof T]: FieldGenerator<T[K]> };
}

/** 工厂实例，用于生成测试数据 */
export interface Factory<T extends Record<string, unknown>> {
  /**
   * 生成单个对象
   * @param overrides 覆盖字段（可选）
   * @returns 生成的对象
   */
  build(overrides?: Partial<T>): T;

  /**
   * 生成多个对象
   * @param count 数量
   * @param overrides 覆盖字段（可选）
   * @returns 生成的对象数组
   */
  buildMany(count: number, overrides?: Partial<T>): T[];

  /**
   * 按序列生成多个对象
   * @param count 数量
   * @param fn 根据索引返回覆盖字段的函数
   * @returns 生成的对象数组
   */
  buildSequence(count: number, fn: (index: number) => Partial<T>): T[];
}

/**
 * 解析字段生成器，获取实际值
 * @param generator 字段生成器
 * @returns 实际值
 */
function resolveField<T>(generator: FieldGenerator<T>): T {
  return typeof generator === "function" ? (generator as () => T)() : generator;
}

/**
 * 定义测试数据工厂
 * @param definition 工厂定义
 * @returns 工厂实例
 */
export function defineFactory<T extends Record<string, unknown>>(
  definition: FactoryDefinition<T>,
): Factory<T> {
  function build(overrides?: Partial<T>): T {
    const result = {} as Record<string, unknown>;
    for (const key of Object.keys(definition.fields)) {
      result[key] = resolveField(definition.fields[key as keyof T] as FieldGenerator<unknown>);
    }
    if (overrides) {
      for (const key of Object.keys(overrides)) {
        result[key] = overrides[key as keyof T];
      }
    }
    return result as T;
  }

  return {
    build,
    buildMany(count: number, overrides?: Partial<T>): T[] {
      return Array.from({ length: count }, () => build(overrides));
    },
    buildSequence(count: number, fn: (index: number) => Partial<T>): T[] {
      return Array.from({ length: count }, (_, i) => build(fn(i)));
    },
  };
}

/**
 * 创建序列生成器
 * @param prefix 前缀，默认 "item"
 * @returns 返回带前缀和递增序号的字符串的函数
 */
export function sequence(prefix = "item"): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `${prefix}_${counter}`;
  };
}

/**
 * 创建随机选择生成器
 * @param values 可选值列表
 * @returns 每次调用随机返回一个值的函数
 */
export function oneOf<T>(...values: T[]): () => T {
  return () => values[Math.floor(Math.random() * values.length)]!;
}

/**
 * 创建 UUID 生成器
 * @returns 每次调用返回一个随机 UUID 的函数
 */
export function uuid(): () => string {
  return () => crypto.randomUUID();
}
