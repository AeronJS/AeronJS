// @ventostack/core - 生命周期管理

/** 生命周期钩子函数 */
export type LifecycleHook = () => Promise<void> | void;

/** 生命周期管理器接口 */
export interface Lifecycle {
  /**
   * 注册启动前钩子
   * @param hook - 钩子函数
   */
  onBeforeStart(hook: LifecycleHook): void;
  /**
   * 注册启动后钩子
   * @param hook - 钩子函数
   */
  onAfterStart(hook: LifecycleHook): void;
  /**
   * 注册停止前钩子
   * @param hook - 钩子函数
   */
  onBeforeStop(hook: LifecycleHook): void;
  /** 执行启动前钩子 */
  runBeforeStart(): Promise<void>;
  /** 执行启动后钩子 */
  runAfterStart(): Promise<void>;
  /** 执行停止前钩子 */
  runBeforeStop(): Promise<void>;
}

/**
 * 创建生命周期管理器
 * @returns Lifecycle 实例
 */
export function createLifecycle(): Lifecycle {
  const beforeStartHooks: LifecycleHook[] = [];
  const afterStartHooks: LifecycleHook[] = [];
  const beforeStopHooks: LifecycleHook[] = [];

  async function runHooks(hooks: LifecycleHook[]): Promise<void> {
    for (const hook of hooks) {
      await hook();
    }
  }

  return {
    onBeforeStart(hook: LifecycleHook): void {
      beforeStartHooks.push(hook);
    },

    onAfterStart(hook: LifecycleHook): void {
      afterStartHooks.push(hook);
    },

    onBeforeStop(hook: LifecycleHook): void {
      beforeStopHooks.push(hook);
    },

    runBeforeStart(): Promise<void> {
      return runHooks(beforeStartHooks);
    },

    runAfterStart(): Promise<void> {
      return runHooks(afterStartHooks);
    },

    runBeforeStop(): Promise<void> {
      return runHooks(beforeStopHooks);
    },
  };
}
