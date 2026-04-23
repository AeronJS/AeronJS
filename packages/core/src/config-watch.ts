// @ventostack/core - 配置动态热更新

/** 配置热更新监控器选项 */
export interface ConfigWatcherOptions {
  /** 检查间隔（ms） */
  interval?: number;
  /** 变更回调 */
  onChange: (
    newConfig: Record<string, unknown>,
    oldConfig: Record<string, unknown>,
  ) => void | Promise<void>;
}

/** 配置热更新监控器接口 */
export interface ConfigWatcher {
  /**
   * 启动监控
   * @param initial - 初始配置
   */
  start(initial: Record<string, unknown>): void;
  /** 停止监控 */
  stop(): void;
  /** 是否正在监控 */
  isWatching(): boolean;
  /**
   * 手动更新配置
   * @param newConfig - 新配置
   */
  update(newConfig: Record<string, unknown>): Promise<void>;
  /** 获取当前配置 */
  getConfig(): Record<string, unknown>;
}

/**
 * 创建配置热更新监控器
 * 支持 watch + callback 模式，配置变更时不重启生效
 * @param options - 监控器选项
 * @returns ConfigWatcher 实例
 */
export function createConfigWatcher(options: ConfigWatcherOptions): ConfigWatcher {
  const _interval = options.interval ?? 5000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentConfig: Record<string, unknown> = {};
  let watching = false;

  function hasChanged(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  return {
    start(initial: Record<string, unknown>): void {
      currentConfig = { ...initial };
      watching = true;
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      watching = false;
    },

    isWatching(): boolean {
      return watching;
    },

    async update(newConfig: Record<string, unknown>): Promise<void> {
      if (hasChanged(currentConfig, newConfig)) {
        const oldConfig = { ...currentConfig };
        currentConfig = { ...newConfig };
        await options.onChange(currentConfig, oldConfig);
      }
    },

    getConfig(): Record<string, unknown> {
      return { ...currentConfig };
    },
  };
}
