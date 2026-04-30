/**
 * @ventostack/events - 分布式任务调度（防重复执行，抢锁机制）
 * 基于内存锁实现任务互斥执行，支持超时控制与执行结果追踪
 * 生产环境应替换为 Redis 分布式锁以保证多实例一致性
 */

/** 分布式任务定义 */
export interface DistributedTask {
  /** 任务唯一标识 */
  id: string;
  /** 任务名称 */
  name: string;
  /** Cron 表达式（可选） */
  cron?: string;
  /** 任务执行函数 */
  handler: () => Promise<void>;
  /** 任务超时时间（毫秒，可选） */
  timeout?: number;
}

/** 分布式调度器配置选项 */
export interface DistributedSchedulerOptions {
  /** 实例 ID */
  instanceId?: string;
  /** 锁超时（ms） */
  lockTimeout?: number;
  /** 锁续期间隔（ms） */
  renewInterval?: number;
}

/** 任务锁信息 */
export interface TaskLock {
  /** 任务 ID */
  taskId: string;
  /** 持有锁的实例 ID */
  instanceId: string;
  /** 获取锁的时间戳 */
  acquiredAt: number;
  /** 锁过期时间戳 */
  expiresAt: number;
}

/** 分布式调度器接口 */
export interface DistributedScheduler {
  /**
   * 注册任务
   * @param task 分布式任务定义
   */
  register(task: DistributedTask): void;

  /**
   * 尝试获取任务锁
   * @param taskId 任务 ID
   * @returns 获取成功返回 true，否则返回 false
   */
  tryAcquire(taskId: string): Promise<boolean>;

  /**
   * 释放任务锁
   * @param taskId 任务 ID
   */
  release(taskId: string): void;

  /**
   * 执行指定任务
   * @param taskId 任务 ID
   * @returns 执行结果，包含是否成功、错误信息和耗时
   */
  execute(taskId: string): Promise<{ success: boolean; error?: string; duration: number }>;

  /**
   * 获取当前所有锁信息
   * @returns 锁列表
   */
  getLocks(): TaskLock[];

  /**
   * 获取已注册的任务 ID 列表
   * @returns 任务 ID 列表
   */
  getRegistered(): string[];
}

/**
 * 创建分布式任务调度器
 * 使用内存锁实现（生产环境应替换为 Redis 分布式锁）
 * @param options 分布式调度器配置选项
 * @returns 分布式调度器实例
 */
export function createDistributedScheduler(
  options?: DistributedSchedulerOptions,
): DistributedScheduler {
  const instanceId = options?.instanceId ?? crypto.randomUUID();
  const lockTimeout = options?.lockTimeout ?? 60000;
  const tasks = new Map<string, DistributedTask>();
  const locks = new Map<string, TaskLock>();

  function cleanExpiredLocks(): void {
    const now = Date.now();
    for (const [taskId, lock] of locks) {
      if (lock.expiresAt <= now) {
        locks.delete(taskId);
      }
    }
  }

  return {
    register(task: DistributedTask): void {
      tasks.set(task.id, task);
    },

    async tryAcquire(taskId: string): Promise<boolean> {
      cleanExpiredLocks();
      const existing = locks.get(taskId);
      if (existing && existing.expiresAt > Date.now()) {
        return false; // 已被其他实例锁定
      }

      locks.set(taskId, {
        taskId,
        instanceId,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + lockTimeout,
      });
      return true;
    },

    release(taskId: string): void {
      const lock = locks.get(taskId);
      if (lock && lock.instanceId === instanceId) {
        locks.delete(taskId);
      }
    },

    async execute(taskId: string): Promise<{ success: boolean; error?: string; duration: number }> {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: `Task not found: ${taskId}`, duration: 0 };
      }

      const acquired = await this.tryAcquire(taskId);
      if (!acquired) {
        return { success: false, error: "Failed to acquire lock", duration: 0 };
      }

      const start = performance.now();
      try {
        if (task.timeout) {
          await Promise.race([
            task.handler(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Task timeout")), task.timeout),
            ),
          ]);
        } else {
          await task.handler();
        }
        return { success: true, duration: performance.now() - start };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          duration: performance.now() - start,
        };
      } finally {
        this.release(taskId);
      }
    },

    getLocks(): TaskLock[] {
      cleanExpiredLocks();
      return Array.from(locks.values());
    },

    getRegistered(): string[] {
      return Array.from(tasks.keys());
    },
  };
}
