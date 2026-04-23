// ============================================================
// @ventostack/openapi — Generator
// OpenAPI 3.0 文档生成器
// ============================================================

import type { OpenAPISchema } from "./schema-builder";

// ---- Types ----

/** OpenAPI 文档基本信息 */
export interface OpenAPIInfo {
  /** 文档标题 */
  title: string;
  /** 文档版本 */
  version: string;
  /** 文档描述 */
  description?: string;
}

/** OpenAPI 服务器信息 */
export interface OpenAPIServer {
  /** 服务器 URL */
  url: string;
  /** 服务器描述 */
  description?: string;
}

/** OpenAPI 参数定义 */
export interface OpenAPIParameter {
  /** 参数名称 */
  name: string;
  /** 参数位置 */
  in: "path" | "query" | "header" | "cookie";
  /** 是否必填 */
  required?: boolean;
  /** 参数 Schema */
  schema: OpenAPISchema;
  /** 参数描述 */
  description?: string;
}

/** OpenAPI 请求体定义 */
export interface OpenAPIRequestBody {
  /** 请求体描述 */
  description?: string;
  /** 是否必填 */
  required?: boolean;
  /** 内容类型与 Schema 映射 */
  content: Record<string, { schema: OpenAPISchema }>;
}

/** OpenAPI 响应定义 */
export interface OpenAPIResponse {
  /** 响应描述 */
  description: string;
  /** 内容类型与 Schema 映射 */
  content?: Record<string, { schema: OpenAPISchema }>;
}

/** OpenAPI 操作定义 */
export interface OpenAPIOperation {
  /** 操作摘要 */
  summary?: string;
  /** 操作详细描述 */
  description?: string;
  /** 标签分类 */
  tags?: string[];
  /** 操作唯一标识 */
  operationId?: string;
  /** 参数列表 */
  parameters?: OpenAPIParameter[];
  /** 请求体 */
  requestBody?: OpenAPIRequestBody;
  /** 响应映射（状态码 -> 响应定义） */
  responses: Record<string, OpenAPIResponse>;
  /** 安全要求 */
  security?: Array<Record<string, string[]>>;
  /** 是否已废弃 */
  deprecated?: boolean;
}

/** OpenAPI 路径定义 */
export interface OpenAPIPath {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

/** OpenAPI 标签定义 */
export interface OpenAPITag {
  /** 标签名称 */
  name: string;
  /** 标签描述 */
  description?: string;
}

/** OpenAPI 3.0 完整文档 */
export interface OpenAPIDocument {
  /** OpenAPI 版本 */
  openapi: "3.0.3";
  /** 文档基本信息 */
  info: OpenAPIInfo;
  /** 服务器列表 */
  servers?: OpenAPIServer[];
  /** 路径定义 */
  paths: Record<string, OpenAPIPath>;
  /** 组件定义（Schema、安全方案等） */
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, unknown>;
  };
  /** 标签列表 */
  tags?: OpenAPITag[];
}

/** OpenAPI 文档生成器 */
export interface OpenAPIGenerator {
  /** 设置文档基本信息 */
  setInfo(info: OpenAPIInfo): void;
  /** 添加服务器 */
  addServer(server: OpenAPIServer): void;
  /** 添加标签 */
  addTag(name: string, description?: string): void;
  /** 添加 Schema 定义 */
  addSchema(name: string, schema: OpenAPISchema): void;
  /** 添加安全方案 */
  addSecurityScheme(name: string, scheme: unknown): void;
  /** 添加路径操作 */
  addPath(path: string, method: string, operation: OpenAPIOperation): void;
  /** 生成完整文档 */
  generate(): OpenAPIDocument;
  /** 导出为 JSON 字符串 */
  toJSON(): string;
  /** 导出为 YAML 字符串 */
  toYAML(): string;
}

// ---- YAML 序列化器 ----

/** YAML 缩进单位 */
const YAML_INDENT = "  ";

/**
 * 转义 YAML 字符串，必要时使用 JSON 引号包裹
 * @param value - 原始字符串
 * @returns 转义后的 YAML 安全字符串
 */
function yamlEscapeString(value: string): string {
  if (
    value === "" ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /^\d+(\.\d+)?$/.test(value) ||
    /[:{}\[\],&*?|>!%#@`'"\n\r]/.test(value) ||
    value.startsWith(" ") ||
    value.endsWith(" ")
  ) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * 将任意值序列化为 YAML 字符串片段
 * @param value - 待序列化的值
 * @param depth - 当前缩进深度
 * @returns YAML 字符串片段
 */
function toYAMLValue(value: unknown, depth: number): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return yamlEscapeString(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const lines: string[] = [];
    const prefix = YAML_INDENT.repeat(depth);
    for (const item of value) {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length === 0) {
          lines.push(`${prefix}- {}`);
        } else {
          const [firstKey, firstVal] = entries[0]!;
          lines.push(`${prefix}- ${firstKey}: ${toYAMLValue(firstVal, depth + 2)}`);
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i]!;
            lines.push(`${prefix}  ${k}: ${toYAMLValue(v, depth + 2)}`);
          }
        }
      } else {
        lines.push(`${prefix}- ${toYAMLValue(item, depth + 1)}`);
      }
    }
    return `\n${lines.join("\n")}`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return "{}";
    }
    const lines: string[] = [];
    const prefix = YAML_INDENT.repeat(depth);
    for (const key of keys) {
      const val = obj[key];
      const rendered = toYAMLValue(val, depth + 1);
      if (rendered.startsWith("\n")) {
        lines.push(`${prefix}${key}:${rendered}`);
      } else {
        lines.push(`${prefix}${key}: ${rendered}`);
      }
    }
    return `\n${lines.join("\n")}`;
  }
  return String(value);
}

/**
 * 将对象序列化为 YAML 字符串
 * @param obj - 待序列化的对象
 * @returns 完整 YAML 字符串
 */
export function toYAML(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return toYAMLValue(obj, 0);
  }
  const record = obj as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of Object.keys(record)) {
    const val = record[key];
    const rendered = toYAMLValue(val, 1);
    if (rendered.startsWith("\n")) {
      lines.push(`${key}:${rendered}`);
    } else {
      lines.push(`${key}: ${rendered}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---- Factory ----

/** 支持的 HTTP 方法集合 */
const VALID_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * 创建 OpenAPI 文档生成器实例
 * @returns OpenAPIGenerator 实例
 */
export function createOpenAPIGenerator(): OpenAPIGenerator {
  let info: OpenAPIInfo = { title: "", version: "0.0.0" };
  const servers: OpenAPIServer[] = [];
  const tags: OpenAPITag[] = [];
  const schemas: Record<string, OpenAPISchema> = {};
  const securitySchemes: Record<string, unknown> = {};
  const paths: Record<string, OpenAPIPath> = {};

  return {
    setInfo(newInfo: OpenAPIInfo): void {
      info = newInfo;
    },

    addServer(server: OpenAPIServer): void {
      servers.push(server);
    },

    addTag(name: string, description?: string): void {
      const tag: OpenAPITag = { name };
      if (description !== undefined) {
        tag.description = description;
      }
      tags.push(tag);
    },

    addSchema(name: string, schema: OpenAPISchema): void {
      schemas[name] = schema;
    },

    addSecurityScheme(name: string, scheme: unknown): void {
      securitySchemes[name] = scheme;
    },

    addPath(path: string, method: string, operation: OpenAPIOperation): void {
      const m = method.toLowerCase();
      if (!VALID_METHODS.has(m)) {
        throw new Error(
          `Invalid HTTP method: ${method}. Must be one of: ${[...VALID_METHODS].join(", ")}`,
        );
      }
      if (!paths[path]) {
        paths[path] = {};
      }
      (paths[path] as Record<string, OpenAPIOperation>)[m] = operation;
    },

    generate(): OpenAPIDocument {
      const doc: OpenAPIDocument = {
        openapi: "3.0.3",
        info,
        paths,
      };

      if (servers.length > 0) {
        doc.servers = servers;
      }

      if (tags.length > 0) {
        doc.tags = tags;
      }

      const hasSchemas = Object.keys(schemas).length > 0;
      const hasSecuritySchemes = Object.keys(securitySchemes).length > 0;
      if (hasSchemas || hasSecuritySchemes) {
        doc.components = {};
        if (hasSchemas) {
          doc.components.schemas = schemas;
        }
        if (hasSecuritySchemes) {
          doc.components.securitySchemes = securitySchemes;
        }
      }

      return doc;
    },

    toJSON(): string {
      return JSON.stringify(this.generate(), null, 2);
    },

    toYAML(): string {
      return toYAML(this.generate());
    },
  };
}
