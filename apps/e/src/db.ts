/**
 * @file 连接池使用示例
 *
 * `createConnectionPool` 是一个**通用连接池**，不绑定任何具体数据库。
 * 你需要在 `factory.create` 中提供自己的连接创建逻辑。
 */

import { createConnectionPool } from "@ventostack/database";

/** 模拟的数据库连接对象 */
interface DbConn {
  query(text: string, params?: unknown[]): Promise<unknown[]>;
  end(): Promise<void>;
  ping(): Promise<boolean>;
}

const pool = createConnectionPool<DbConn>({
  /** 创建新连接：每次被调用时应返回一个全新的数据库连接 */
  create: async () => {
    // 实际项目中替换为你的数据库驱动创建逻辑
    // 例如 PostgreSQL: return new Client(process.env.DATABASE_URL)
    return {
      query: async () => [],
      end: async () => {},
      ping: async () => true,
    };
  },

  /** 销毁连接：永久关闭并从池中移除 */
  destroy: async (conn) => {
    await conn.end();
  },

  /** 校验连接：获取空闲连接时调用，返回 false 则销毁并重新获取（可选） */
  validate: async (conn) => {
    return await conn.ping();
  },
}, {
  /** 最小空闲连接数 */
  min: 2,
  /** 最大连接数 */
  max: 10,
  /** 空闲连接超时（毫秒） */
  idleTimeout: 30_000,
  /** 获取连接超时（毫秒） */
  acquireTimeout: 5_000,
  /** 连接最大存活时间（毫秒） */
  maxLifetime: 3_600_000,
});

// 获取连接并执行查询
async function getUser(userId: number) {
  const conn = await pool.acquire();
  try {
    const rows = await conn.query("SELECT * FROM users WHERE id = $1", [userId]);
    return rows;
  } finally {
    // 释放回池，供后续复用
    pool.release(conn);
  }
}

export { pool, getUser };
