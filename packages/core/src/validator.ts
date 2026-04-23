// @ventostack/core - Schema 验证器

import type { Context } from "./context";
import type { Middleware } from "./middleware";

/** 字段类型 */
export type FieldType = "string" | "number" | "boolean" | "array" | "object";

/** 字段校验规则 */
export interface FieldRule {
  /** 字段类型 */
  type: FieldType;
  /** 是否必填 */
  required?: boolean;
  /** 最小值/最小长度 */
  min?: number;
  /** 最大值/最大长度 */
  max?: number;
  /** 正则匹配 */
  pattern?: RegExp;
  /** 枚举值 */
  enum?: readonly unknown[];
  /** 数组元素规则 */
  items?: FieldRule;
  /** 对象属性规则 */
  properties?: Record<string, FieldRule>;
  /** 自定义校验函数，返回错误字符串或 null */
  custom?: (value: unknown) => string | null;
}

/** 校验 Schema */
export type Schema = Record<string, FieldRule>;

/** 校验结果 */
export interface ValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 校验单个字段
 * @param value - 字段值
 * @param rule - 校验规则
 * @param path - 字段路径（用于报错）
 * @returns 错误信息列表
 */
function validateField(value: unknown, rule: FieldRule, path: string): string[] {
  const errors: string[] = [];

  // required check
  if (value === null || value === undefined) {
    if (rule.required) {
      errors.push(`${path} is required`);
    }
    return errors;
  }

  // type check
  if (rule.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be of type array`);
      return errors;
    }
  } else if (rule.type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path} must be of type object`);
      return errors;
    }
  } else if (rule.type === "string" && typeof value !== "string") {
    errors.push(`${path} must be of type string`);
    return errors;
  } else if (rule.type === "number" && typeof value !== "number") {
    errors.push(`${path} must be of type number`);
    return errors;
  } else if (rule.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path} must be of type boolean`);
    return errors;
  }

  // min/max for string
  if (rule.type === "string" && typeof value === "string") {
    if (rule.min !== undefined && value.length < rule.min) {
      errors.push(`${path} must have at least ${rule.min} characters`);
    }
    if (rule.max !== undefined && value.length > rule.max) {
      errors.push(`${path} must have at most ${rule.max} characters`);
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${path} does not match pattern`);
    }
  }

  // min/max for number
  if (rule.type === "number" && typeof value === "number") {
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${path} must be at least ${rule.min}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${path} must be at most ${rule.max}`);
    }
  }

  // min/max for array
  if (rule.type === "array" && Array.isArray(value)) {
    if (rule.min !== undefined && value.length < rule.min) {
      errors.push(`${path} must have at least ${rule.min} items`);
    }
    if (rule.max !== undefined && value.length > rule.max) {
      errors.push(`${path} must have at most ${rule.max} items`);
    }
    // items validation
    if (rule.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateField(value[i], rule.items, `${path}[${i}]`));
      }
    }
  }

  // enum check
  if (rule.enum !== undefined && !rule.enum.includes(value)) {
    errors.push(`${path} must be one of: ${rule.enum.join(", ")}`);
  }

  // properties for object
  if (rule.type === "object" && rule.properties && typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const [key, subRule] of Object.entries(rule.properties)) {
      errors.push(...validateField(obj[key], subRule, `${path}.${key}`));
    }
  }

  // custom validator
  if (rule.custom) {
    const customError = rule.custom(value);
    if (customError !== null) {
      errors.push(`${path}: ${customError}`);
    }
  }

  return errors;
}

/**
 * 校验数据对象是否符合 Schema
 * @param data - 待校验数据
 * @param schema - 校验规则
 * @returns 校验结果
 */
export function validate(data: unknown, schema: Schema): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["data must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;
  for (const [key, rule] of Object.entries(schema)) {
    errors.push(...validateField(obj[key], rule, key));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 创建请求体校验中间件
 * @param schema - 校验规则
 * @returns Middleware 实例
 */
export function validateBody(schema: Schema): Middleware {
  return async (ctx: Context, next) => {
    let body: unknown;
    try {
      body = await ctx.request.clone().json();
    } catch {
      return ctx.json({ error: "Invalid JSON body" }, 400);
    }

    const result = validate(body, schema);
    if (!result.valid) {
      return ctx.json({ errors: result.errors }, 400);
    }

    return next();
  };
}

/**
 * 创建查询参数校验中间件
 * @param schema - 校验规则
 * @returns Middleware 实例
 */
export function validateQuery(schema: Schema): Middleware {
  return async (ctx: Context, next) => {
    const result = validate(ctx.query, schema);
    if (!result.valid) {
      return ctx.json({ errors: result.errors }, 400);
    }

    return next();
  };
}
