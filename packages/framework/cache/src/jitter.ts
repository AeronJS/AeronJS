/**
 * @ventostack/cache - 缓存雪崩防护（TTL 抖动）
 * 给 TTL 添加随机偏移，打散大量缓存的集中过期时间，防止请求瞬间涌向数据库
 */

import type { CacheAdapter } from "./cache";

/**
 * 给 TTL 添加随机抖动，防止缓存雪崩。
 * 大量缓存在同一时刻过期会导致请求瞬间涌向数据库，通过随机偏移打散过期时间。
 * @param baseTTL 基础 TTL（秒）
 * @param jitterPercent 抖动百分比 (0-1)，默认 0.1 (10%)
 * @returns 加了抖动的 TTL（秒）
 */
export function jitterTTL(baseTTL: number, jitterPercent = 0.1): number {
  if (baseTTL <= 0) return baseTTL;
  const jitter = baseTTL * jitterPercent;
  // 随机偏移量在 [-jitter, +jitter] 范围内
  const offset = (Math.random() * 2 - 1) * jitter;
  return Math.max(1, Math.round(baseTTL + offset));
}

/**
 * 抖动缓存配置选项
 */
export interface JitterCacheOptions {
  /** 抖动百分比，默认 0.1 (10%) */
  jitterPercent?: number;
}

/**
 * 包装 CacheAdapter，自动给所有 set 操作添加 TTL 抖动
 * @param adapter 原始缓存适配器
 * @param options 抖动配置选项
 * @returns 带抖动功能的缓存适配器
 */
export function withJitter(adapter: CacheAdapter, options: JitterCacheOptions = {}): CacheAdapter {
  const { jitterPercent = 0.1 } = options;

  return {
    get: (key) => adapter.get(key),
    set: (key, value, ttl) => {
      const adjustedTTL = ttl ? jitterTTL(ttl, jitterPercent) : undefined;
      return adapter.set(key, value, adjustedTTL);
    },
    del: (key) => adapter.del(key),
    has: (key) => adapter.has(key),
    flush: () => adapter.flush(),
    keys: (pattern) => adapter.keys(pattern),
  };
}
