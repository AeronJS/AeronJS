/**
 * @ventostack/cache - 二级缓存（本地 L1 + 远端 L2）
 * L1 为本地内存缓存，用于热数据快速访问；L2 为远端持久化/共享缓存
 * 支持写穿策略、FIFO 驱逐、命中统计与过期清理
 */

import type { CacheAdapter } from "./cache";

/**
 * 二级缓存配置选项
 */
export interface L2CacheOptions {
  /** L1 默认 TTL（毫秒） */
  l1TTL?: number;
  /** L1 最大条目数 */
  l1MaxSize?: number;
  /** 是否写穿到 L2 */
  writeThrough?: boolean;
}

/**
 * 二级缓存接口
 * L1 为本地内存缓存，L2 为远端持久化/共享缓存
 */
export interface L2Cache {
  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 反序列化后的缓存值，不存在时返回 null
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值（任意类型，内部会序列化为 JSON）
   * @param ttl 可选的过期时间（秒）
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * 删除指定缓存键（同时清除 L1 和 L2）
   * @param key 缓存键
   */
  delete(key: string): Promise<void>;

  /**
   * 清空缓存（同时清空 L1 和统计信息）
   */
  clear(): Promise<void>;

  /**
   * 获取缓存命中统计
   * @returns 包含 L1 命中、L2 命中、未命中和 L1 当前大小的统计对象
   */
  stats(): { l1Hits: number; l2Hits: number; misses: number; l1Size: number };
}

/**
 * L1 本地缓存条目结构
 */
interface L1Entry {
  /** 缓存值 */
  value: unknown;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

/**
 * 创建二级缓存（本地内存 L1 + 远端 L2）
 * L1 用于热数据快速访问，L2 作为持久化/共享缓存
 * @param l2Adapter 远端 L2 缓存适配器
 * @param options 二级缓存配置选项
 * @returns 二级缓存实例
 */
export function createL2Cache(l2Adapter: CacheAdapter, options?: L2CacheOptions): L2Cache {
  const l1TTL = options?.l1TTL ?? 5000;
  const l1MaxSize = options?.l1MaxSize ?? 1000;
  const writeThrough = options?.writeThrough ?? true;

  const l1 = new Map<string, L1Entry>();
  let l1Hits = 0;
  let l2Hits = 0;
  let misses = 0;

  /**
   * 驱逐 L1 中已过期的条目
   */
  function evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of l1) {
      if (entry.expiresAt <= now) {
        l1.delete(key);
      }
    }
  }

  /**
   * 当 L1 超出最大条目数时，按 FIFO 策略驱逐最老的条目
   */
  function evictLRU(): void {
    if (l1.size <= l1MaxSize) return;
    // 简单 FIFO 驱逐
    const keysToRemove = l1.size - l1MaxSize;
    const iter = l1.keys();
    for (let i = 0; i < keysToRemove; i++) {
      const { value: key } = iter.next();
      if (key) l1.delete(key);
    }
  }

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      // 查 L1
      const l1Entry = l1.get(key);
      if (l1Entry && l1Entry.expiresAt > Date.now()) {
        l1Hits++;
        return l1Entry.value as T;
      }
      if (l1Entry) l1.delete(key);

      // 查 L2
      const l2Value = await l2Adapter.get(key);
      if (l2Value !== null && l2Value !== undefined) {
        l2Hits++;
        const parsed = typeof l2Value === "string" ? JSON.parse(l2Value) : l2Value;
        // 写回 L1
        l1.set(key, { value: parsed, expiresAt: Date.now() + l1TTL });
        evictLRU();
        return parsed as T;
      }

      misses++;
      return null;
    },

    async set(key: string, value: unknown, ttl?: number): Promise<void> {
      // 写 L1
      l1.set(key, { value, expiresAt: Date.now() + (ttl ?? l1TTL) });
      evictLRU();

      // 写 L2
      if (writeThrough) {
        await l2Adapter.set(key, JSON.stringify(value), ttl);
      }
    },

    async delete(key: string): Promise<void> {
      l1.delete(key);
      await l2Adapter.del(key);
    },

    async clear(): Promise<void> {
      l1.clear();
      l1Hits = 0;
      l2Hits = 0;
      misses = 0;
    },

    stats(): { l1Hits: number; l2Hits: number; misses: number; l1Size: number } {
      evictExpired();
      return { l1Hits, l2Hits, misses, l1Size: l1.size };
    },
  };
}
