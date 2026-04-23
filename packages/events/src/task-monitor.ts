/**
 * @ventostack/events - 任务可观测（状态 / 重试 / 日志）
 * 提供任务全生命周期追踪与日志记录能力，支持 pending/running/completed/failed/retrying/timeout 六种状态
 * 适用于异步任务监控、故障排查与审计追溯
 */

/** 任务状态 */
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "retrying" | "timeout";

/** 任务日志条目 */
export interface TaskLogEntry {
  /** 日志时间戳 */
  timestamp: number;
  /** 日志级别 */
  level: "info" | "warn" | "error";
  /** 日志消息 */
  message: string;
  /** 附加元数据（可选） */
  meta?: Record<string, unknown>;
}

/** 任务记录 */
export interface TaskRecord {
  /** 任务唯一标识 */
  id: string;
  /** 任务名称 */
  name: string;
  /** 当前状态 */
  status: TaskStatus;
  /** 已尝试次数 */
  attempts: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 开始时间戳（可选） */
  startedAt?: number;
  /** 完成时间戳（可选） */
  completedAt?: number;
  /** 执行耗时（毫秒，可选） */
  duration?: number;
  /** 错误信息（可选） */
  error?: string;
  /** 日志列表 */
  logs: TaskLogEntry[];
}

/** 任务监控器接口 */
export interface TaskMonitor {
  /**
   * 注册任务追踪
   * @param id 任务唯一标识
   * @param name 任务名称
   * @param maxAttempts 最大尝试次数（默认 3）
   */
  track(id: string, name: string, maxAttempts?: number): void;

  /**
   * 标记任务开始
   * @param id 任务唯一标识
   */
  start(id: string): void;

  /**
   * 标记任务完成
   * @param id 任务唯一标识
   */
  complete(id: string): void;

  /**
   * 标记任务失败
   * @param id 任务唯一标识
   * @param error 错误信息
   */
  fail(id: string, error: string): void;

  /**
   * 标记任务进入重试
   * @param id 任务唯一标识
   */
  retry(id: string): void;

  /**
   * 记录任务日志
   * @param id 任务唯一标识
   * @param level 日志级别
   * @param message 日志消息
   * @param meta 附加元数据（可选）
   */
  log(
    id: string,
    level: TaskLogEntry["level"],
    message: string,
    meta?: Record<string, unknown>,
  ): void;

  /**
   * 获取任务记录
   * @param id 任务唯一标识
   * @returns 任务记录，不存在返回 undefined
   */
  get(id: string): TaskRecord | undefined;

  /**
   * 列出任务记录
   * @param filter 过滤条件（可选）
   * @returns 任务记录列表
   */
  list(filter?: { status?: TaskStatus; name?: string }): TaskRecord[];

  /**
   * 获取任务统计信息
   * @returns 各状态任务数量统计
   */
  stats(): { total: number; running: number; completed: number; failed: number; pending: number };

  /** 清空所有任务记录 */
  clear(): void;
}

/**
 * 创建任务监控器实例
 * 基于内存 Map 存储任务记录，支持全生命周期追踪与日志
 * @returns 任务监控器实例
 */
export function createTaskMonitor(): TaskMonitor {
  const tasks = new Map<string, TaskRecord>();

  return {
    track(id: string, name: string, maxAttempts = 3): void {
      tasks.set(id, {
        id,
        name,
        status: "pending",
        attempts: 0,
        maxAttempts,
        logs: [],
      });
    },

    start(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "running";
      task.startedAt = Date.now();
      task.attempts++;
      task.logs.push({
        timestamp: Date.now(),
        level: "info",
        message: `Task started (attempt ${task.attempts})`,
      });
    },

    complete(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "completed";
      task.completedAt = Date.now();
      task.duration = task.startedAt ? task.completedAt - task.startedAt : 0;
      task.logs.push({ timestamp: Date.now(), level: "info", message: "Task completed" });
    },

    fail(id: string, error: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "failed";
      task.error = error;
      task.completedAt = Date.now();
      task.duration = task.startedAt ? task.completedAt - task.startedAt : 0;
      task.logs.push({ timestamp: Date.now(), level: "error", message: `Task failed: ${error}` });
    },

    retry(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "retrying";
      task.logs.push({
        timestamp: Date.now(),
        level: "warn",
        message: `Retrying task (attempt ${task.attempts + 1})`,
      });
    },

    log(
      id: string,
      level: TaskLogEntry["level"],
      message: string,
      meta?: Record<string, unknown>,
    ): void {
      const task = tasks.get(id);
      if (!task) return;
      const entry: TaskLogEntry = { timestamp: Date.now(), level, message };
      if (meta) entry.meta = meta;
      task.logs.push(entry);
    },

    get(id: string): TaskRecord | undefined {
      return tasks.get(id);
    },

    list(filter?: { status?: TaskStatus; name?: string }): TaskRecord[] {
      let result = Array.from(tasks.values());
      if (filter?.status) result = result.filter((t) => t.status === filter.status);
      if (filter?.name) result = result.filter((t) => t.name === filter.name);
      return result;
    },

    stats() {
      const all = Array.from(tasks.values());
      return {
        total: all.length,
        running: all.filter((t) => t.status === "running").length,
        completed: all.filter((t) => t.status === "completed").length,
        failed: all.filter((t) => t.status === "failed").length,
        pending: all.filter((t) => t.status === "pending").length,
      };
    },

    clear(): void {
      tasks.clear();
    },
  };
}
