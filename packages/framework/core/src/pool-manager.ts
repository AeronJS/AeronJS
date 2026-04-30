// @ventostack/core - 连接池释放与资源管理

/** 可释放资源接口 */
export interface Disposable {
  /** 资源名称 */
  name: string;
  /** 关闭资源 */
  close(): Promise<void>;
}

/** 连接池管理器接口 */
export interface PoolManager {
  /**
   * 注册可释放资源
   * @param resource - 资源对象
   */
  register(resource: Disposable): void;
  /**
   * 释放所有已注册资源
   * @returns 释放结果列表
   */
  releaseAll(): Promise<{ name: string; error?: string }[]>;
  /** 获取已注册资源名称列表 */
  list(): string[];
}

/**
 * 创建连接池/资源管理器，用于优雅关闭时释放所有连接池
 * @returns PoolManager 实例
 */
export function createPoolManager(): PoolManager {
  const resources: Disposable[] = [];

  return {
    register(resource: Disposable): void {
      resources.push(resource);
    },

    async releaseAll(): Promise<{ name: string; error?: string }[]> {
      const results: { name: string; error?: string }[] = [];
      // 逆序释放（后注册先释放）
      for (let i = resources.length - 1; i >= 0; i--) {
        const resource = resources[i]!;
        try {
          await resource.close();
          results.push({ name: resource.name });
        } catch (err) {
          results.push({
            name: resource.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      resources.length = 0;
      return results;
    },

    list(): string[] {
      return resources.map((r) => r.name);
    },
  };
}
