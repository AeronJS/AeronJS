/**
 * @ventostack/database — 连接池管理
 * 提供通用连接复用、空闲回收、等待队列与统计能力
 * 支持最大连接数、空闲超时、获取超时与连接最大存活时间配置
 */

/**
 * 连接池配置选项。
 */
export interface ConnectionPoolOptions {
  /** 最大连接数 */
  max?: number;
  /** 最小空闲连接数 */
  min?: number;
  /** 空闲连接超时（毫秒） */
  idleTimeout?: number;
  /** 获取连接超时（毫秒） */
  acquireTimeout?: number;
  /** 连接最大存活时间（毫秒） */
  maxLifetime?: number;
}

/**
 * 连接池统计信息。
 */
export interface PoolStats {
  /** 当前总连接数 */
  total: number;
  /** 活跃连接数 */
  active: number;
  /** 空闲连接数 */
  idle: number;
  /** 等待队列长度 */
  waiting: number;
  /** 最大连接数限制 */
  maxSize: number;
}

/**
 * 连接池接口。
 * @template T — 连接对象类型
 */
export interface ConnectionPool<T> {
  /** 获取连接（可能等待） */
  acquire(): Promise<T>;
  /**
   * 释放连接回池。
   * @param conn — 连接对象
   */
  release(conn: T): void;
  /**
   * 销毁连接（从池中移除）。
   * @param conn — 连接对象
   */
  destroy(conn: T): void;
  /** 获取当前统计信息 */
  stats(): PoolStats;
  /** 排空并关闭连接池 */
  drain(): Promise<void>;
  /** 当前连接池大小 */
  size(): number;
}

/**
 * 池内连接包装对象。
 * @template T — 连接对象类型
 */
interface PooledConnection<T> {
  /** 实际连接对象 */
  conn: T;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后使用时间戳 */
  lastUsed: number;
  /** 是否处于活跃状态 */
  active: boolean;
}

/**
 * 创建通用连接池。
 * @template T — 连接对象类型
 * @param factory — 连接工厂（创建、销毁、可选校验）
 * @param options — 连接池配置
 * @returns ConnectionPool 实例
 */
export function createConnectionPool<T>(
  factory: {
    create: () => Promise<T>;
    destroy: (conn: T) => Promise<void>;
    validate?: (conn: T) => Promise<boolean>;
  },
  options?: ConnectionPoolOptions,
): ConnectionPool<T> {
  const max = options?.max ?? 10;
  const _min = options?.min ?? 2;
  const idleTimeout = options?.idleTimeout ?? 30000;
  const acquireTimeout = options?.acquireTimeout ?? 5000;
  const maxLifetime = options?.maxLifetime ?? 3600000;

  const connections: PooledConnection<T>[] = [];
  const waitQueue: {
    resolve: (conn: T) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  let closed = false;

  /**
   * 查找可用的空闲连接。
   * @returns 可用连接包装对象，或 undefined
   */
  function getIdleConnection(): PooledConnection<T> | undefined {
    const now = Date.now();
    for (const pc of connections) {
      if (!pc.active && now - pc.createdAt < maxLifetime && now - pc.lastUsed < idleTimeout) {
        return pc;
      }
    }
    return undefined;
  }

  /**
   * 清理过期或超时的空闲连接。
   */
  function cleanup(): void {
    const now = Date.now();
    for (let i = connections.length - 1; i >= 0; i--) {
      const pc = connections[i]!;
      if (!pc.active && (now - pc.createdAt >= maxLifetime || now - pc.lastUsed >= idleTimeout)) {
        connections.splice(i, 1);
        factory.destroy(pc.conn).catch(() => {});
      }
    }
  }

  const cleanupTimer = setInterval(cleanup, Math.min(idleTimeout, 10000));

  return {
    async acquire(): Promise<T> {
      if (closed) throw new Error("Pool is closed");

      // 尝试复用空闲连接
      const idle = getIdleConnection();
      if (idle) {
        idle.active = true;
        idle.lastUsed = Date.now();
        if (factory.validate) {
          const valid = await factory.validate(idle.conn);
          if (!valid) {
            const idx = connections.indexOf(idle);
            if (idx !== -1) connections.splice(idx, 1);
            await factory.destroy(idle.conn);
            return this.acquire();
          }
        }
        return idle.conn;
      }

      // 创建新连接
      if (connections.length < max) {
        const conn = await factory.create();
        const pc: PooledConnection<T> = {
          conn,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          active: true,
        };
        connections.push(pc);
        return conn;
      }

      // 等待空闲连接
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waitQueue.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) waitQueue.splice(idx, 1);
          reject(new Error("Acquire connection timeout"));
        }, acquireTimeout);
        waitQueue.push({ resolve, reject, timer });
      });
    },

    release(conn: T): void {
      const pc = connections.find((c) => c.conn === conn);
      if (!pc) return;
      pc.active = false;
      pc.lastUsed = Date.now();

      // 唤醒等待中的请求
      if (waitQueue.length > 0) {
        const waiter = waitQueue.shift()!;
        clearTimeout(waiter.timer);
        pc.active = true;
        pc.lastUsed = Date.now();
        waiter.resolve(conn);
      }
    },

    destroy(conn: T): void {
      const idx = connections.findIndex((c) => c.conn === conn);
      if (idx !== -1) {
        connections.splice(idx, 1);
        factory.destroy(conn).catch(() => {});
      }
    },

    stats(): PoolStats {
      return {
        total: connections.length,
        active: connections.filter((c) => c.active).length,
        idle: connections.filter((c) => !c.active).length,
        waiting: waitQueue.length,
        maxSize: max,
      };
    },

    async drain(): Promise<void> {
      closed = true;
      clearInterval(cleanupTimer);
      for (const waiter of waitQueue) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Pool is draining"));
      }
      waitQueue.length = 0;
      for (const pc of connections) {
        await factory.destroy(pc.conn).catch(() => {});
      }
      connections.length = 0;
    },

    size(): number {
      return connections.length;
    },
  };
}
