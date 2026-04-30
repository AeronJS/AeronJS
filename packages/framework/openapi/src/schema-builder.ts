// ============================================================
// @ventostack/openapi — Schema Builder
// OpenAPI 3.0 Schema 构建函数
// ============================================================

/** OpenAPI 3.0 Schema 对象 */
export interface OpenAPISchema {
  /** 数据类型 */
  type?: string;
  /** 对象属性定义 */
  properties?: Record<string, OpenAPISchema>;
  /** 必填属性列表 */
  required?: string[];
  /** 数组元素 Schema */
  items?: OpenAPISchema;
  /** 枚举值列表 */
  enum?: unknown[];
  /** 字段描述 */
  description?: string;
  /** 示例值 */
  example?: unknown;
  /** 数据格式（如 date-time、email） */
  format?: string;
  /** 数值最小值 */
  minimum?: number;
  /** 数值最大值 */
  maximum?: number;
  /** 字符串最小长度 */
  minLength?: number;
  /** 字符串最大长度 */
  maxLength?: number;
  /** 字符串正则模式 */
  pattern?: string;
  /** 是否可为 null */
  nullable?: boolean;
  /** 联合类型 */
  oneOf?: OpenAPISchema[];
  /** 组合类型 */
  allOf?: OpenAPISchema[];
  /** 引用其他 Schema */
  $ref?: string;
}

/** 字符串 Schema 选项 */
export interface SchemaStringOptions {
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 正则模式 */
  pattern?: string;
  /** 数据格式 */
  format?: string;
  /** 字段描述 */
  description?: string;
  /** 示例值 */
  example?: string;
}

/** 数字 Schema 选项 */
export interface SchemaNumberOptions {
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 数据格式 */
  format?: string;
  /** 字段描述 */
  description?: string;
  /** 示例值 */
  example?: number;
}

/** 整数 Schema 选项 */
export interface SchemaIntegerOptions {
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 字段描述 */
  description?: string;
  /** 示例值 */
  example?: number;
}

/** 布尔 Schema 选项 */
export interface SchemaBooleanOptions {
  /** 字段描述 */
  description?: string;
  /** 示例值 */
  example?: boolean;
}

/** 数组 Schema 选项 */
export interface SchemaArrayOptions {
  /** 字段描述 */
  description?: string;
  /** 最小元素数 */
  minItems?: number;
  /** 最大元素数 */
  maxItems?: number;
}

/** 对象 Schema 选项 */
export interface SchemaObjectOptions {
  /** 字段描述 */
  description?: string;
}

/** 枚举 Schema 选项 */
export interface SchemaEnumOptions {
  /** 字段描述 */
  description?: string;
}

/**
 * 创建字符串类型 Schema
 * @param options - 字符串 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaString(options?: SchemaStringOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "string" };
  if (options) {
    if (options.minLength !== undefined) schema.minLength = options.minLength;
    if (options.maxLength !== undefined) schema.maxLength = options.maxLength;
    if (options.pattern !== undefined) schema.pattern = options.pattern;
    if (options.format !== undefined) schema.format = options.format;
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

/**
 * 创建数字类型 Schema
 * @param options - 数字 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaNumber(options?: SchemaNumberOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "number" };
  if (options) {
    if (options.minimum !== undefined) schema.minimum = options.minimum;
    if (options.maximum !== undefined) schema.maximum = options.maximum;
    if (options.format !== undefined) schema.format = options.format;
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

/**
 * 创建整数类型 Schema
 * @param options - 整数 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaInteger(options?: SchemaIntegerOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "integer" };
  if (options) {
    if (options.minimum !== undefined) schema.minimum = options.minimum;
    if (options.maximum !== undefined) schema.maximum = options.maximum;
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

/**
 * 创建布尔类型 Schema
 * @param options - 布尔 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaBoolean(options?: SchemaBooleanOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "boolean" };
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

/**
 * 创建数组类型 Schema
 * @param items - 数组元素 Schema
 * @param options - 数组 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaArray(items: OpenAPISchema, options?: SchemaArrayOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "array", items };
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
  }
  return schema;
}

/**
 * 创建对象类型 Schema
 * @param properties - 对象属性定义
 * @param required - 必填属性列表
 * @param options - 对象 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaObject(
  properties: Record<string, OpenAPISchema>,
  required?: string[],
  options?: SchemaObjectOptions,
): OpenAPISchema {
  const schema: OpenAPISchema = { type: "object", properties };
  if (required && required.length > 0) {
    schema.required = required;
  }
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
  }
  return schema;
}

/**
 * 创建枚举类型 Schema
 * @param values - 枚举值列表
 * @param options - 枚举 Schema 选项
 * @returns OpenAPISchema 对象
 */
export function schemaEnum(values: unknown[], options?: SchemaEnumOptions): OpenAPISchema {
  const schema: OpenAPISchema = { enum: values };
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
  }
  return schema;
}

/**
 * 创建 Schema 引用
 * @param name - 被引用的 Schema 名称
 * @returns 包含 $ref 的 OpenAPISchema 对象
 */
export function schemaRef(name: string): OpenAPISchema {
  return { $ref: `#/components/schemas/${name}` };
}
