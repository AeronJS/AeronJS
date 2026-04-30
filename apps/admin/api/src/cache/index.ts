/**
 * 缓存层初始化
 */

import { createCache, createMemoryAdapter, createRedisAdapter } from "@ventostack/cache";
import type { Cache } from "@ventostack/cache";
import { env } from "../config";

export type { Cache };

/**
 * 创建缓存实例
 * 支持 memory（开发/测试）和 redis（生产）两种驱动
 */
export async function createCacheInstance(): Promise<Cache> {
  switch (env.CACHE_DRIVER) {
    case "redis": {
      const redisUrl = env.REDIS_URL ?? "redis://localhost:6379";
      const raw = new Bun.RedisClient(redisUrl);
      await raw.connect();
      console.log(`[cache] Using Redis adapter (${redisUrl})`);
      // 适配 RedisCacheClientLike 接口（Bun.RedisClient 缺少 flushdb，用 send 代替）
      const client = {
        get: (key: string) => raw.get(key),
        set: (key: string, value: string) => raw.set(key, value),
        expire: (key: string, seconds: number) => raw.expire(key, seconds),
        del: (key: string) => raw.del(key),
        exists: (key: string) => raw.exists(key),
        flushdb: () => raw.send("FLUSHDB", []),
        keys: (pattern: string) => raw.keys(pattern),
      };
      return createCache(createRedisAdapter({ client, keyPrefix: "admin:" }));
    }
    case "memory":
    default: {
      console.log("[cache] Using memory adapter");
      return createCache(createMemoryAdapter());
    }
  }
}
