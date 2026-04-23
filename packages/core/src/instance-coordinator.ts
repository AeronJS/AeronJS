// @ventostack/core - 多实例协调（k8s readiness / liveness）

/** 实例状态 */
export type InstanceState = "starting" | "ready" | "draining" | "stopped";

/** 实例协调器接口 */
export interface InstanceCoordinator {
  /** 获取当前实例状态 */
  getState(): InstanceState;
  /**
   * 设置实例状态
   * @param state - 目标状态
   */
  setState(state: InstanceState): void;
  /** 实例是否就绪 */
  isReady(): boolean;
  /** 实例是否存活 */
  isLive(): boolean;
  /** 标记为排流状态（停止接收新流量） */
  markDraining(): void;
  /** 标记为就绪状态 */
  markReady(): void;
  /** 标记为已停止 */
  markStopped(): void;
  /** 获取实例唯一标识 */
  getInstanceId(): string;
  /** 获取实例元数据 */
  getMetadata(): Record<string, unknown>;
  /**
   * 设置实例元数据
   * @param key - 键
   * @param value - 值
   */
  setMetadata(key: string, value: unknown): void;
}

/**
 * 创建实例协调器，管理当前实例的生命周期状态
 * 配合 k8s readiness/liveness probe 使用
 * @param instanceId - 可选实例 ID，默认生成 UUID
 * @returns InstanceCoordinator 实例
 */
export function createInstanceCoordinator(instanceId?: string): InstanceCoordinator {
  let state: InstanceState = "starting";
  const id = instanceId ?? crypto.randomUUID();
  const metadata: Record<string, unknown> = {
    startedAt: Date.now(),
    pid: typeof process !== "undefined" ? process.pid : 0,
  };

  return {
    getState(): InstanceState {
      return state;
    },

    setState(newState: InstanceState): void {
      state = newState;
    },

    isReady(): boolean {
      return state === "ready";
    },

    isLive(): boolean {
      return state !== "stopped";
    },

    markDraining(): void {
      state = "draining";
    },

    markReady(): void {
      state = "ready";
    },

    markStopped(): void {
      state = "stopped";
    },

    getInstanceId(): string {
      return id;
    },

    getMetadata(): Record<string, unknown> {
      return { ...metadata };
    },

    setMetadata(key: string, value: unknown): void {
      metadata[key] = value;
    },
  };
}
