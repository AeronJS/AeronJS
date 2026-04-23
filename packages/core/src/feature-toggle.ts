// @ventostack/core - Feature Toggle（特性开关）

/** 特性开关定义 */
export interface FeatureFlag {
  /** 开关名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 可选的条件函数 */
  condition?: (context: Record<string, unknown>) => boolean;
  /** 描述 */
  description?: string;
}

/** 特性开关管理器接口 */
export interface FeatureToggle {
  /**
   * 注册特性开关
   * @param flag - 开关定义
   */
  register(flag: FeatureFlag): void;
  /**
   * 判断开关是否启用
   * @param name - 开关名称
   * @param context - 可选上下文
   * @returns 是否启用
   */
  isEnabled(name: string, context?: Record<string, unknown>): boolean;
  /**
   * 启用指定开关
   * @param name - 开关名称
   */
  enable(name: string): void;
  /**
   * 禁用指定开关
   * @param name - 开关名称
   */
  disable(name: string): void;
  /**
   * 切换指定开关状态
   * @param name - 开关名称
   */
  toggle(name: string): void;
  /** 获取所有开关列表 */
  list(): readonly FeatureFlag[];
  /**
   * 批量设置开关状态
   * @param flags - 开关状态映射
   */
  setAll(flags: Record<string, boolean>): void;
}

/**
 * 创建特性开关管理器
 * @param initial - 初始开关列表
 * @returns FeatureToggle 实例
 */
export function createFeatureToggle(initial?: FeatureFlag[]): FeatureToggle {
  const flags = new Map<string, FeatureFlag>();

  if (initial) {
    for (const flag of initial) {
      flags.set(flag.name, { ...flag });
    }
  }

  return {
    register(flag) {
      flags.set(flag.name, { ...flag });
    },

    isEnabled(name, context) {
      const flag = flags.get(name);
      if (!flag) return false;
      if (!flag.enabled) return false;
      if (flag.condition && context) {
        return flag.condition(context);
      }
      return flag.enabled;
    },

    enable(name) {
      const flag = flags.get(name);
      if (flag) flag.enabled = true;
    },

    disable(name) {
      const flag = flags.get(name);
      if (flag) flag.enabled = false;
    },

    toggle(name) {
      const flag = flags.get(name);
      if (flag) flag.enabled = !flag.enabled;
    },

    list() {
      return [...flags.values()];
    },

    setAll(newFlags) {
      for (const [name, enabled] of Object.entries(newFlags)) {
        const flag = flags.get(name);
        if (flag) {
          flag.enabled = enabled;
        } else {
          flags.set(name, { name, enabled });
        }
      }
    },
  };
}
