// ============================================================
// @ventostack/openapi — Route Metadata (decorators.ts)
// 函数式路由元数据定义与 OpenAPI 转换
// ============================================================

import type { Router, SchemaField, RouteSchemaConfig } from "@ventostack/core";
import type {
  OpenAPIGenerator,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
} from "./generator";
import type { OpenAPISchema } from "./schema-builder";

/** 路由元数据，用于描述单条路由的 OpenAPI 文档信息 */
export interface RouteMetadata {
  /** 路由路径 */
  path: string;
  /** HTTP 方法 */
  method: string;
  /** 接口摘要 */
  summary?: string;
  /** 接口详细描述 */
  description?: string;
  /** 标签分类 */
  tags?: string[];
  /** 操作唯一标识 */
  operationId?: string;
  /** 路径/查询/头参数定义 */
  parameters?: OpenAPIParameter[];
  /** 请求体定义 */
  requestBody?: OpenAPIRequestBody;
  /** 响应定义 */
  responses?: Record<string, OpenAPIResponse>;
  /** 安全要求 */
  security?: Array<Record<string, string[]>>;
  /** 是否已废弃 */
  deprecated?: boolean;
}

/**
 * 定义单条路由的 OpenAPI 元数据
 * @param metadata - 路由元数据对象
 * @returns 原样返回的元数据对象，便于链式使用
 */
export function defineRouteDoc(metadata: RouteMetadata): RouteMetadata {
  return metadata;
}

/**
 * 将一组路由元数据批量注入到 OpenAPIGenerator 中
 * @param routes - 路由元数据数组
 * @param generator - OpenAPI 生成器实例
 */
export function routesToOpenAPI(routes: RouteMetadata[], generator: OpenAPIGenerator): void {
  for (const route of routes) {
    const operation: OpenAPIOperation = {
      responses: route.responses ?? {
        "200": { description: "Success" },
      },
    };

    if (route.summary !== undefined) operation.summary = route.summary;
    if (route.description !== undefined) operation.description = route.description;
    if (route.tags !== undefined) operation.tags = route.tags;
    if (route.operationId !== undefined) operation.operationId = route.operationId;
    if (route.parameters !== undefined) operation.parameters = route.parameters;
    if (route.requestBody !== undefined) operation.requestBody = route.requestBody;
    if (route.security !== undefined) operation.security = route.security;
    if (route.deprecated !== undefined) operation.deprecated = route.deprecated;

    generator.addPath(route.path, route.method, operation);
  }
}

// ---- Schema 转换辅助函数 ----

/** 支持的 SchemaField 类型集合，用于区分 SchemaField 与 Record<string, SchemaField> */
const SCHEMA_FIELD_TYPES = new Set([
  "string", "number", "boolean", "int", "float", "bool", "uuid", "date", "array", "object", "file",
]);

/**
 * 将核心 SchemaField 转换为 OpenAPISchema
 * @param field - 核心路由 Schema 字段定义
 * @returns OpenAPI 3.0 Schema 对象
 */
function schemaFieldToOpenAPISchema(field: SchemaField): OpenAPISchema {
  const schema: OpenAPISchema = {};

  switch (field.type) {
    case "string":
    case "uuid":
      schema.type = "string";
      if (field.type === "uuid") schema.format = "uuid";
      break;
    case "number":
    case "float":
      schema.type = "number";
      break;
    case "int":
      schema.type = "integer";
      break;
    case "boolean":
    case "bool":
      schema.type = "boolean";
      break;
    case "date":
      schema.type = "string";
      schema.format = "date-time";
      break;
    case "array":
      schema.type = "array";
      if (field.items) {
        schema.items = schemaFieldToOpenAPISchema(field.items);
      }
      break;
    case "object":
      schema.type = "object";
      if (field.properties) {
        schema.properties = {};
        for (const [key, prop] of Object.entries(field.properties)) {
          schema.properties[key] = schemaFieldToOpenAPISchema(prop);
        }
      }
      break;
    case "file":
      schema.type = "string";
      schema.format = "binary";
      break;
  }

  if (field.description !== undefined) schema.description = field.description;
  if (field.example !== undefined) schema.example = field.example;
  if (field.format !== undefined && schema.format === undefined) schema.format = field.format;
  if (field.enum !== undefined) schema.enum = [...field.enum];
  if (field.pattern !== undefined) schema.pattern = field.pattern.source;

  if (field.min !== undefined) {
    if (field.type === "string" || field.type === "uuid") {
      schema.minLength = field.min;
    } else if (field.type === "array") {
      // OpenAPISchema 当前未定义 minItems，跳过
    } else {
      schema.minimum = field.min;
    }
  }
  if (field.max !== undefined) {
    if (field.type === "string" || field.type === "uuid") {
      schema.maxLength = field.max;
    } else if (field.type === "array") {
      // OpenAPISchema 当前未定义 maxItems，跳过
    } else {
      schema.maximum = field.max;
    }
  }

  return schema;
}

/**
 * 从路由 SchemaConfig 的 responses 字段构建 OpenAPI 响应映射
 * @param schemaConfig - 路由 Schema 配置
 * @returns OpenAPI 响应映射，若未定义则返回 undefined
 */
function buildResponsesFromSchemaConfig(
  schemaConfig: RouteSchemaConfig | undefined,
): Record<string, OpenAPIResponse> | undefined {
  if (!schemaConfig?.responses) return undefined;

  const responses: Record<string, OpenAPIResponse> = {};

  for (const [statusCode, responseDef] of Object.entries(schemaConfig.responses)) {
    let responseSchema: OpenAPISchema;

    if (
      responseDef &&
      typeof responseDef === "object" &&
      !Array.isArray(responseDef) &&
      "type" in responseDef &&
      SCHEMA_FIELD_TYPES.has(responseDef.type as string)
    ) {
      responseSchema = schemaFieldToOpenAPISchema(responseDef as SchemaField);
    } else if (responseDef && typeof responseDef === "object" && !Array.isArray(responseDef)) {
      const properties: Record<string, OpenAPISchema> = {};
      const requiredFields: string[] = [];
      for (const [name, field] of Object.entries(responseDef as Record<string, SchemaField>)) {
        properties[name] = schemaFieldToOpenAPISchema(field);
        if (field.required) requiredFields.push(name);
      }
      responseSchema = {
        type: "object",
        properties,
        ...(requiredFields.length > 0 ? { required: requiredFields } : {}),
      };
    } else {
      responseSchema = { type: "object" };
    }

    responses[statusCode] = {
      description: getStatusDescription(statusCode),
      content: {
        "application/json": { schema: responseSchema },
      },
    };
  }

  return responses;
}

/**
 * 从路由 SchemaConfig 的 query 字段构建 OpenAPI 参数列表
 * @param schemaConfig - 路由 Schema 配置
 * @returns OpenAPI 参数列表
 */
function buildParametersFromSchemaConfig(
  schemaConfig: RouteSchemaConfig | undefined,
): OpenAPIParameter[] {
  if (!schemaConfig?.query) return [];

  const parameters: OpenAPIParameter[] = [];
  for (const [name, field] of Object.entries(schemaConfig.query)) {
    parameters.push({
      name,
      in: "query",
      required: field.required === true,
      schema: schemaFieldToOpenAPISchema(field),
      ...(field.description !== undefined ? { description: field.description } : {}),
    });
  }
  return parameters;
}

/**
 * 从路由 SchemaConfig 的 body 字段构建 OpenAPI 请求体
 * @param schemaConfig - 路由 Schema 配置
 * @returns OpenAPI 请求体定义，若未定义则返回 undefined
 */
function buildRequestBodyFromSchemaConfig(
  schemaConfig: RouteSchemaConfig | undefined,
): OpenAPIRequestBody | undefined {
  if (!schemaConfig?.body) return undefined;

  const properties: Record<string, OpenAPISchema> = {};
  const requiredFields: string[] = [];
  for (const [name, field] of Object.entries(schemaConfig.body)) {
    properties[name] = schemaFieldToOpenAPISchema(field);
    if (field.required) requiredFields.push(name);
  }

  return {
    required: requiredFields.length > 0,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties,
          ...(requiredFields.length > 0 ? { required: requiredFields } : {}),
        },
      },
    },
  };
}

/**
 * 获取常见 HTTP 状态码的默认描述
 * @param statusCode - 状态码字符串
 * @returns 描述文本
 */
function getStatusDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    "200": "OK",
    "201": "Created",
    "204": "No Content",
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "404": "Not Found",
    "409": "Conflict",
    "422": "Unprocessable Entity",
    "500": "Internal Server Error",
  };
  return descriptions[statusCode] ?? "Response";
}

// ---- 路由同步 ----

/**
 * 自动将 Router 中已注册的所有路由同步到 OpenAPIGenerator
 * @param router - VentoStack 路由实例
 * @param generator - OpenAPI 生成器实例
 *
 * 读取逻辑（优先级从高到低）：
 * 1. 路由 metadata?.openapi 中的手动声明
 * 2. 路由 schemaConfig 中定义的 query / body / responses 自动生成
 * 3. 默认 200 响应作为兜底
 */
export function syncRouterToOpenAPI(router: Router, generator: OpenAPIGenerator): void {
  for (const route of router.routes()) {
    const openapiMeta = route.metadata?.openapi as Partial<OpenAPIOperation> | undefined;
    const schemaConfig = route.schemaConfig as RouteSchemaConfig | undefined;

    // 响应：openapiMeta > schemaConfig > default
    const autoResponses = buildResponsesFromSchemaConfig(schemaConfig);
    const operation: OpenAPIOperation = {
      responses: openapiMeta?.responses ?? autoResponses ?? {
        "200": { description: "Success" },
      },
    };

    // 参数：合并 schemaConfig.query 与 openapiMeta.parameters（后者优先级更高）
    const autoParams = buildParametersFromSchemaConfig(schemaConfig);
    if (openapiMeta?.parameters !== undefined) {
      const paramMap = new Map(autoParams.map((p) => [`${p.in}:${p.name}`, p]));
      for (const param of openapiMeta.parameters) {
        paramMap.set(`${param.in}:${param.name}`, param);
      }
      operation.parameters = Array.from(paramMap.values());
    } else if (autoParams.length > 0) {
      operation.parameters = autoParams;
    }

    // 请求体：openapiMeta > schemaConfig.body
    if (openapiMeta?.requestBody !== undefined) {
      operation.requestBody = openapiMeta.requestBody;
    } else {
      const autoRequestBody = buildRequestBodyFromSchemaConfig(schemaConfig);
      if (autoRequestBody) operation.requestBody = autoRequestBody;
    }

    // 其他元数据字段（手动声明优先）
    if (openapiMeta?.summary !== undefined) operation.summary = openapiMeta.summary;
    if (openapiMeta?.description !== undefined) operation.description = openapiMeta.description;
    if (openapiMeta?.tags !== undefined) operation.tags = openapiMeta.tags;
    if (openapiMeta?.operationId !== undefined) operation.operationId = openapiMeta.operationId;
    if (openapiMeta?.security !== undefined) operation.security = openapiMeta.security;
    if (openapiMeta?.deprecated !== undefined) operation.deprecated = openapiMeta.deprecated;

    generator.addPath(route.path, route.method, operation);
  }
}
