/**
 * @ventostack/cache - 分布式一致性（防 cache stampede）
 * 提供互斥锁与 XFetch 概率性提前刷新算法，防止高并发下缓存失效导致大量请求穿透到数据库
 */

/**
 * 缓存击穿防护配置选项
 */
export interface StampedeProtectionOptions {
  /** 锁超时时间（毫秒） */
  lockTimeout?: number;
  /** 等待间隔（毫秒） */
  waitInterval?: number;
  /** 最大等待次数 */
  maxWaitAttempts?: number;
  /** 提前刷新时间窗口（毫秒），在 TTL 到期前提前刷新 */
  earlyRefreshWindow?: number;
}

/**
 * 缓存击穿防护器接口
 * 防止高并发下缓存失效导致大量请求同时穿透到数据库
 */
export interface StampedeProtection {
  /**
   * 获取缓存值，防止 stampede
   * 使用互斥锁确保只有一个请求去加载数据，其他请求等待
   * @param key 缓存键
   * @param loader 数据加载函数
   * @param ttl 缓存过期时间（秒）
   * @returns 缓存值或加载后的值
   */
  getOrLoad<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T>;

  /**
   * 概率性提前刷新（XFetch 算法）
   * 在缓存即将过期时，以一定概率提前刷新，避免集中过期
   * @param key 缓存键
   * @param loader 数据加载函数
   * @param ttl 缓存过期时间（秒）
   * @returns 缓存值或加载后的值
   */
  getOrLoadXFetch<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T>;
}

/**
 * 带元数据的缓存条目结构（用于 XFetch 算法）
 */
interface CacheEntry<T> {
  /** 缓存值 */
  value: T;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
  /** 上次加载耗时（毫秒） */
  delta: number;
}

/**
 * 创建 Stampede 保护器
 * @param getter 缓存读取函数
 * @param setter 缓存写入函数
 * @param options 防护配置选项
 * @returns Stampede 防护器实例
 */
export function createStampedeProtection(
  getter: (key: string) => Promise<string | null>,
  setter: (key: string, value: string, ttl?: number) => Promise<void>,
  options?: StampedeProtectionOptions,
): StampedeProtection {
  const lockTimeout = options?.lockTimeout ?? 5000;
  const waitInterval = options?.waitInterval ?? 50;
  const maxWaitAttempts = options?.maxWaitAttempts ?? 100;
  const earlyRefreshWindow = options?.earlyRefreshWindow ?? 1000;

  const locks = new Map<string, Promise<unknown>>();

  /**
   * 尝试获取内存级互斥锁
   * @param key 锁键
   * @returns 成功获取返回 true，否则返回 false
   */
  async function acquireLock(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    if (locks.has(lockKey)) return false;
    locks.set(lockKey, new Promise((resolve) => setTimeout(resolve, lockTimeout)));
    return true;
  }

  /**
   * 释放内存级互斥锁
   * @param key 锁键
   */
  function releaseLock(key: string): void {
    locks.delete(`lock:${key}`);
  }

  return {
    async getOrLoad<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T> {
      // 尝试从缓存获取
      const cached = await getter(key);
      if (cached !== null) {
        try {
          return JSON.parse(cached) as T;
        } catch {
          // 缓存损坏，重新加载
        }
      }

      // 尝试获取锁
      const locked = await acquireLock(key);
      if (locked) {
        try {
          // 双重检查
          const rechecked = await getter(key);
          if (rechecked !== null) {
            try {
              return JSON.parse(rechecked) as T;
            } catch {
              // 继续加载
            }
          }
          const value = await loader();
          await setter(key, JSON.stringify(value), ttl);
          return value;
        } finally {
          releaseLock(key);
        }
      }

      // 等待其他请求完成
      for (let i = 0; i < maxWaitAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, waitInterval));
        const result = await getter(key);
        if (result !== null) {
          try {
            return JSON.parse(result) as T;
          } catch {}
        }
      }

      // 超时，直接加载
      const value = await loader();
      await setter(key, JSON.stringify(value), ttl);
      return value;
    },

    async getOrLoadXFetch<T>(key: string, loader: () => Promise<T>, ttl: number): Promise<T> {
      const metaKey = `meta:${key}`;
      const cached = await getter(metaKey);

      if (cached !== null) {
        try {
          const entry = JSON.parse(cached) as CacheEntry<T>;
          const now = Date.now();
          const remaining = entry.expiresAt - now;

          // XFetch 概率公式：probability = delta * beta * log(random)
          // beta 通常为 1
          if (remaining > 0) {
            const beta = 1;
            const probability = entry.delta * beta * Math.log(Math.random());
            if (remaining + probability > earlyRefreshWindow) {
              return entry.value;
            }
          }
        } catch {
          // 继续重新加载
        }
      }

      const start = performance.now();
      const value = await loader();
      const delta = performance.now() - start;

      const entry: CacheEntry<T> = {
        value,
        expiresAt: Date.now() + ttl,
        delta,
      };
      await setter(metaKey, JSON.stringify(entry), ttl);
      await setter(key, JSON.stringify(value), ttl);

      return value;
    },
  };
}
