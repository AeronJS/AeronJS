// @ventostack/core - A/B 测试与灰度发布

/** A/B 测试变体 */
export interface ABTestVariant {
  /** 变体名称 */
  name: string;
  /** 权重 */
  weight: number;
  /** 附加配置 */
  config?: Record<string, unknown>;
}

/** A/B 测试定义 */
export interface ABTest {
  /** 测试名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 变体列表 */
  variants: ABTestVariant[];
  /** 用户粘性分配（基于 userId hash） */
  sticky?: boolean;
}

/** A/B 测试分配结果 */
export interface ABTestResult {
  /** 测试名称 */
  testName: string;
  /** 分配的变体名称 */
  variant: string;
  /** 附加配置 */
  config?: Record<string, unknown>;
}

/** A/B 测试管理器接口 */
export interface ABTestManager {
  /**
   * 定义 A/B 测试
   * @param test - 测试定义
   */
  define(test: ABTest): void;
  /**
   * 为用户分配变体
   * @param testName - 测试名称
   * @param userId - 用户标识
   * @returns 分配结果或 null（测试未启用）
   */
  assign(testName: string, userId?: string): ABTestResult | null;
  /**
   * 判断用户是否命中指定变体
   * @param testName - 测试名称
   * @param variantName - 变体名称
   * @param userId - 用户标识
   * @returns 是否命中
   */
  isInVariant(testName: string, variantName: string, userId?: string): boolean;
  /** 获取所有测试列表 */
  list(): ABTest[];
  /**
   * 启用指定测试
   * @param testName - 测试名称
   */
  enable(testName: string): void;
  /**
   * 禁用指定测试
   * @param testName - 测试名称
   */
  disable(testName: string): void;
}

/**
 * 计算字符串 hash 值
 * @param str - 输入字符串
 * @returns hash 数值
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/**
 * 创建 A/B 测试管理器
 * 支持按用户/流量切换、动态开关、权重分配
 * @returns ABTestManager 实例
 */
export function createABTestManager(): ABTestManager {
  const tests = new Map<string, ABTest>();
  const stickyAssignments = new Map<string, string>();

  function assignVariant(test: ABTest, userId?: string): ABTestVariant {
    const variants = test.variants;
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

    if (test.sticky && userId) {
      const cacheKey = `${test.name}:${userId}`;
      const cached = stickyAssignments.get(cacheKey);
      if (cached) {
        const variant = variants.find((v) => v.name === cached);
        if (variant) return variant;
      }
    }

    let random: number;
    if (test.sticky && userId) {
      random = (hashCode(`${test.name}:${userId}`) % 10000) / 10000;
    } else {
      random = Math.random();
    }

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight / totalWeight;
      if (random < cumulative) {
        if (test.sticky && userId) {
          stickyAssignments.set(`${test.name}:${userId}`, variant.name);
        }
        return variant;
      }
    }

    return variants[variants.length - 1]!;
  }

  return {
    define(test: ABTest): void {
      if (test.variants.length === 0) {
        throw new Error(`A/B test must have at least one variant: ${test.name}`);
      }
      if (tests.has(test.name)) {
        throw new Error(`Test "${test.name}" is already defined`);
      }
      tests.set(test.name, { ...test });
    },

    assign(testName: string, userId?: string): ABTestResult | null {
      const test = tests.get(testName);
      if (!test) {
        throw new Error(`Test "${testName}" is not found`);
      }
      if (!test.enabled) return null;

      const variant = assignVariant(test, userId);
      const result: ABTestResult = { testName, variant: variant.name };
      if (variant.config) result.config = variant.config;
      return result;
    },

    isInVariant(testName: string, variantName: string, userId?: string): boolean {
      const result = this.assign(testName, userId);
      return result?.variant === variantName;
    },

    list(): ABTest[] {
      return Array.from(tests.values());
    },

    enable(testName: string): void {
      const test = tests.get(testName);
      if (test) test.enabled = true;
    },

    disable(testName: string): void {
      const test = tests.get(testName);
      if (test) test.enabled = false;
    },
  };
}
