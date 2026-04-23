/**
 * @ventostack/auth - 策略引擎
 * 类 Casbin 的策略模型，支持通配符匹配与条件表达式
 * 默认 deny，只有匹配 allow 规则且无 deny 规则时才允许访问
 */

/**
 * 策略规则定义
 * 描述哪些主体对哪些资源执行哪些操作时被允许或拒绝
 */
export interface PolicyRule {
  /** 生效类型：allow 表示允许，deny 表示拒绝 */
  effect: "allow" | "deny";
  /** 主体匹配模式列表（支持 * 通配符） */
  subjects: string[];
  /** 资源匹配模式列表（支持 * 通配符） */
  resources: string[];
  /** 操作匹配模式列表（支持 * 通配符） */
  actions: string[];
  /** 可选的条件表达式列表 */
  conditions?: PolicyConditionDef[];
}

/**
 * 策略条件定义
 * 用于对请求属性进行细粒度匹配
 */
export interface PolicyConditionDef {
  /** 要比较的属性字段名 */
  field: string;
  /** 比较操作符 */
  operator: "eq" | "neq" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte" | "matches";
  /** 比较目标值 */
  value: unknown;
}

/**
 * 策略评估上下文
 * 包含当前请求的主体、资源、操作及附加属性
 */
export interface PolicyEvalContext {
  /** 主体标识 */
  subject: string;
  /** 资源标识 */
  resource: string;
  /** 操作类型 */
  action: string;
  /** 可选的附加属性（用于条件表达式） */
  attributes?: Record<string, unknown>;
}

/**
 * 策略引擎接口
 * 提供策略规则的增删改查与访问请求评估能力
 */
export interface PolicyEngine {
  /**
   * 添加策略规则
   * @param rule 策略规则
   */
  addRule(rule: PolicyRule): void;

  /**
   * 移除指定索引的策略规则
   * @param index 规则索引
   * @returns 成功移除返回 true，索引越界返回 false
   */
  removeRule(index: number): boolean;

  /**
   * 评估访问请求
   * @param ctx 评估上下文
   * @returns 包含 allowed（是否允许）和 matchedRule（匹配的规则）的结果
   */
  evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule };

  /**
   * 获取所有已注册的策略规则
   * @returns 策略规则列表
   */
  getRules(): PolicyRule[];

  /**
   * 清空所有策略规则
   */
  clear(): void;
}

/**
 * 判断值是否匹配模式（支持 * 通配符）
 * @param value 待匹配值
 * @param pattern 匹配模式
 * @returns 匹配返回 true，否则返回 false
 */
function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    return regex.test(value);
  }
  return value === pattern;
}

/**
 * 评估单个条件表达式
 * @param condition 条件定义
 * @param attributes 属性上下文
 * @returns 条件满足返回 true，否则返回 false
 */
function evaluateCondition(
  condition: PolicyConditionDef,
  attributes: Record<string, unknown>,
): boolean {
  const fieldValue = attributes[condition.field];

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;
    case "neq":
      return fieldValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    case "gt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue > condition.value
      );
    case "lt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue < condition.value
      );
    case "gte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue >= condition.value
      );
    case "lte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue <= condition.value
      );
    case "matches":
      return (
        typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        new RegExp(condition.value).test(fieldValue)
      );
    default:
      return false;
  }
}

/**
 * 创建策略引擎实例
 * 支持类 Casbin 的策略模型：subject, resource, action + conditions
 * 默认 deny，只有匹配 allow 规则且无 deny 规则时才允许
 * @returns 策略引擎实例
 */
export function createPolicyEngine(): PolicyEngine {
  const rules: PolicyRule[] = [];

  return {
    addRule(rule: PolicyRule): void {
      rules.push(rule);
    },

    removeRule(index: number): boolean {
      if (index < 0 || index >= rules.length) return false;
      rules.splice(index, 1);
      return true;
    },

    evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule } {
      let allowed = false;
      let matchedRule: PolicyRule | undefined;

      for (const rule of rules) {
        // 匹配 subject
        const subjectMatch = rule.subjects.some((s) => matchesPattern(ctx.subject, s));
        if (!subjectMatch) continue;

        // 匹配 resource
        const resourceMatch = rule.resources.some((r) => matchesPattern(ctx.resource, r));
        if (!resourceMatch) continue;

        // 匹配 action
        const actionMatch = rule.actions.some((a) => matchesPattern(ctx.action, a));
        if (!actionMatch) continue;

        // 匹配条件
        if (rule.conditions && ctx.attributes) {
          const conditionsMatch = rule.conditions.every((c) =>
            evaluateCondition(c, ctx.attributes!),
          );
          if (!conditionsMatch) continue;
        } else if (rule.conditions && !ctx.attributes) {
          continue;
        }

        // deny 优先
        if (rule.effect === "deny") {
          return { allowed: false, matchedRule: rule };
        }

        if (rule.effect === "allow") {
          allowed = true;
          matchedRule = rule;
        }
      }

      const result: { allowed: boolean; matchedRule?: PolicyRule } = { allowed };
      if (matchedRule) result.matchedRule = matchedRule;
      return result;
    },

    getRules(): PolicyRule[] {
      return [...rules];
    },

    clear(): void {
      rules.length = 0;
    },
  };
}
