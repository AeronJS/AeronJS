/**
 * @ventostack/testing - Fixture 管理
 * 提供基于内存 Map 的 Fixture 注册、获取、JSON 文件加载与重置能力
 */

/** Fixture 管理器接口 */
export interface FixtureManager {
  /**
   * 注册 Fixture 数据
   * @param name Fixture 名称
   * @param data Fixture 数据
   */
  register<T>(name: string, data: T): void;

  /**
   * 获取 Fixture 数据
   * @param name Fixture 名称
   * @returns Fixture 数据
   * @throws 若 Fixture 不存在则抛出错误
   */
  get<T>(name: string): T;

  /**
   * 判断 Fixture 是否已注册
   * @param name Fixture 名称
   * @returns 已注册返回 true，否则返回 false
   */
  has(name: string): boolean;

  /**
   * 从 JSON 文件加载 Fixture
   * @param name Fixture 名称
   * @param filePath JSON 文件路径
   */
  loadJSON<_T>(name: string, filePath: string): Promise<void>;

  /** 清空所有 Fixture */
  reset(): void;
}

/**
 * 创建 Fixture 管理器实例
 * 基于内存 Map 存储 Fixture 数据，支持注册、获取与文件加载
 * @returns Fixture 管理器实例
 */
export function createFixtureManager(): FixtureManager {
  const store = new Map<string, unknown>();

  return {
    register<T>(name: string, data: T): void {
      if (store.has(name)) {
        throw new Error(`Fixture "${name}" is already registered`);
      }
      store.set(name, data);
    },

    get<T>(name: string): T {
      if (!store.has(name)) {
        throw new Error(`Fixture "${name}" not found`);
      }
      return store.get(name) as T;
    },

    has(name: string): boolean {
      return store.has(name);
    },

    async loadJSON<T>(name: string, filePath: string): Promise<void> {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        throw new Error(`Fixture file not found: ${filePath}`);
      }
      const data = (await file.json()) as T;
      store.set(name, data);
    },

    reset(): void {
      store.clear();
    },
  };
}
