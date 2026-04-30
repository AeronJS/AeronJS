/**
 * @ventostack/auth - 基于属性的访问控制 (ABAC)
 * 默认 deny，deny 策略优先于 allow；基于内存 Map 存储策略，支持主体/资源/上下文属性匹配
 */

/**
 * 策略条件函数类型
 * 根据主体、资源、上下文属性判断是否满足条件
 */
export type PolicyCondition = (
  /** 主体属性（如用户信息） */
  subject: Record<string, unknown>,
  /** 资源属性（如资源对象） */
  resource: Record<string, unknown>,
  /** 可选的上下文属性（如时间、IP、环境） */
  context?: Record<string, unknown>,
) => boolean;

/**
 * ABAC 策略定义
 * 每个策略包含一个条件函数和生效类型（allow/deny）
 */
export interface Policy {
  /** 策略名称 */
  name: string;
  /** 策略生效类型：allow 表示允许，deny 表示拒绝 */
  effect: "allow" | "deny";
  /** 策略条件函数，返回 true 表示条件匹配 */
  condition: PolicyCondition;
}

/**
 * ABAC 管理器接口
 * 提供策略的增删改查与访问判定能力
 */
export interface ABAC {
  /**
   * 添加策略
   * @param policy 策略定义
   */
  addPolicy(policy: Policy): void;

  /**
   * 移除策略
   * @param name 策略名称
   * @returns 成功移除返回 true，不存在返回 false
   */
  removePolicy(name: string): boolean;

  /**
   * 评估访问请求
   * @param subject 主体属性
   * @param resource 资源属性
   * @param context 可选的上下文属性
   * @returns 包含 allowed（是否允许）和 matchedPolicies（匹配的策略名称列表）的结果对象
   */
  evaluate(
    subject: Record<string, unknown>,
    resource: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): { allowed: boolean; matchedPolicies: string[] };

  /**
   * 列出所有已注册的策略
   * @returns 策略列表
   */
  listPolicies(): Policy[];
}

/**
 * 创建 ABAC 管理器实例
 * 基于内存 Map 存储策略，评估时 deny 优先
 * @returns ABAC 管理器实例
 */
export function createABAC(): ABAC {
  const policies = new Map<string, Policy>();

  return {
    addPolicy(policy: Policy): void {
      policies.set(policy.name, {
        name: policy.name,
        effect: policy.effect,
        condition: policy.condition,
      });
    },

    removePolicy(name: string): boolean {
      return policies.delete(name);
    },

    evaluate(
      subject: Record<string, unknown>,
      resource: Record<string, unknown>,
      context?: Record<string, unknown>,
    ): { allowed: boolean; matchedPolicies: string[] } {
      const matchedPolicies: string[] = [];
      let hasAllow = false;
      let hasDeny = false;

      for (const policy of policies.values()) {
        if (policy.condition(subject, resource, context)) {
          matchedPolicies.push(policy.name);
          if (policy.effect === "deny") {
            hasDeny = true;
          } else if (policy.effect === "allow") {
            hasAllow = true;
          }
        }
      }

      // deny 优先；无匹配策略 = 拒绝
      const allowed = !hasDeny && hasAllow;

      return { allowed, matchedPolicies };
    },

    listPolicies(): Policy[] {
      return Array.from(policies.values()).map((p) => ({
        name: p.name,
        effect: p.effect,
        condition: p.condition,
      }));
    },
  };
}
