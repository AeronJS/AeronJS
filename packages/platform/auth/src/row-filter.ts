/**
 * @ventostack/auth - 资源级权限细控（数据行过滤）
 * 根据用户/租户上下文自动生成 SQL WHERE 条件，实现数据行级隔离
 * 支持静态值、用户属性、租户属性三种值来源
 */

/**
 * 行级过滤规则定义
 * 描述对某资源按某字段进行过滤的条件
 */
export interface RowFilterRule {
  /** 资源/表名，* 表示通配所有资源 */
  resource: string;
  /** 过滤条件字段名 */
  field: string;
  /** 操作符 */
  operator: "eq" | "in" | "neq" | "not_in";
  /** 值来源：user 表示从用户属性取，tenant 表示从租户属性取，static 表示静态值 */
  valueFrom: "user" | "tenant" | "static";
  /** 静态值或属性路径（当 valueFrom 为 user/tenant 时） */
  value: string;
}

/**
 * 行级过滤上下文
 * 包含当前请求的用户、租户、角色及附加属性
 */
export interface RowFilterContext {
  /** 用户 ID */
  userId?: string;
  /** 租户 ID */
  tenantId?: string;
  /** 用户角色列表 */
  roles?: string[];
  /** 附加属性（用于动态取值） */
  attributes?: Record<string, unknown>;
}

/**
 * 行级过滤器接口
 * 根据用户/租户上下文自动生成 WHERE 条件
 */
export interface RowFilter {
  /**
   * 添加过滤规则
   * @param rule 过滤规则
   */
  addRule(rule: RowFilterRule): void;

  /**
   * 获取指定资源在给定上下文下的过滤条件列表
   * @param resource 资源/表名
   * @param ctx 过滤上下文
   * @returns 过滤条件子句列表
   */
  getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[];

  /**
   * 获取所有已注册的过滤规则
   * @returns 过滤规则列表
   */
  getRules(): RowFilterRule[];

  /**
   * 构建 SQL WHERE 子句
   * @param resource 资源/表名
   * @param ctx 过滤上下文
   * @returns SQL WHERE 子句字符串，无过滤条件时返回空字符串
   */
  buildWhereClause(resource: string, ctx: RowFilterContext): string;
}

/**
 * 过滤条件子句结构
 */
export interface RowFilterClause {
  /** 字段名 */
  field: string;
  /** SQL 操作符 */
  operator: string;
  /** 过滤值 */
  value: unknown;
}

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function assertSafeIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
}

function formatSqlLiteral(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("SQL filter value must be a finite number");
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function isMissingFilterValue(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

/**
 * 创建行级数据过滤器实例
 * 根据用户/租户上下文自动生成 WHERE 条件，实现数据行级隔离
 * @returns 行级过滤器实例
 */
export function createRowFilter(): RowFilter {
  const rules: RowFilterRule[] = [];

  /**
   * 根据规则与上下文解析实际过滤值
   * @param rule 过滤规则
   * @param ctx 过滤上下文
   * @returns 解析后的过滤值
   */
  function resolveValue(rule: RowFilterRule, ctx: RowFilterContext): unknown {
    switch (rule.valueFrom) {
      case "user":
        return ctx.userId ?? ctx.attributes?.[rule.value];
      case "tenant":
        return ctx.tenantId ?? ctx.attributes?.[rule.value];
      case "static":
        return rule.value;
      default:
        return rule.value;
    }
  }

  /**
   * 将内部操作符转换为 SQL 操作符
   * @param op 内部操作符
   * @returns SQL 操作符字符串
   */
  function toSqlOperator(op: RowFilterRule["operator"]): string {
    switch (op) {
      case "eq":
        return "=";
      case "neq":
        return "!=";
      case "in":
        return "IN";
      case "not_in":
        return "NOT IN";
    }
  }

  return {
    addRule(rule: RowFilterRule): void {
      assertSafeIdentifier(rule.field);
      rules.push(rule);
    },

    getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[] {
      return rules
        .filter((r) => r.resource === resource || r.resource === "*")
        .map((r) => ({
          field: r.field,
          operator: toSqlOperator(r.operator),
          value: resolveValue(r, ctx),
        }));
    },

    getRules(): RowFilterRule[] {
      return [...rules];
    },

    buildWhereClause(resource: string, ctx: RowFilterContext): string {
      const filters = this.getFilters(resource, ctx);
      if (filters.length === 0) return "";

      if (filters.some((filter) => isMissingFilterValue(filter.value))) {
        return "WHERE 1 = 0";
      }

      const conditions = filters.map((f) => {
        const field = assertSafeIdentifier(f.field);

        if (f.operator === "IN" || f.operator === "NOT IN") {
          const vals = Array.isArray(f.value) ? f.value : [f.value];
          return `${field} ${f.operator} (${vals.map((v) => formatSqlLiteral(v)).join(", ")})`;
        }

        if (f.value === null) {
          return `${field} ${f.operator === "!=" ? "IS NOT NULL" : "IS NULL"}`;
        }

        return `${field} ${f.operator} ${formatSqlLiteral(f.value)}`;
      });

      return `WHERE ${conditions.join(" AND ")}`;
    },
  };
}
