/**
 * @ventostack/testing - HTTP 测试客户端
 * 提供便捷的 HTTP 请求构建、响应解析与默认头管理能力，支持链式设置请求头
 */

/** 测试响应接口 */
export interface TestResponse {
  /** HTTP 状态码 */
  readonly status: number;
  /** 响应头 */
  readonly headers: Headers;
  /** 解析后的响应体（JSON 或文本） */
  readonly body: unknown;
  /** 原始响应文本 */
  readonly text: string;
  /**
   * 将响应体解析为指定类型的 JSON
   * @returns 解析后的对象
   */
  json<T = unknown>(): T;
}

/** 请求选项 */
export interface RequestOptions {
  /** 附加请求头 */
  headers?: Record<string, string>;
  /** URL 查询参数 */
  query?: Record<string, string>;
}

/** 测试客户端接口 */
export interface TestClient {
  /**
   * 发送 GET 请求
   * @param path 请求路径
   * @param options 请求选项（可选）
   * @returns 测试响应
   */
  get(path: string, options?: RequestOptions): Promise<TestResponse>;

  /**
   * 发送 POST 请求
   * @param path 请求路径
   * @param body 请求体（可选）
   * @param options 请求选项（可选）
   * @returns 测试响应
   */
  post(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;

  /**
   * 发送 PUT 请求
   * @param path 请求路径
   * @param body 请求体（可选）
   * @param options 请求选项（可选）
   * @returns 测试响应
   */
  put(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;

  /**
   * 发送 PATCH 请求
   * @param path 请求路径
   * @param body 请求体（可选）
   * @param options 请求选项（可选）
   * @returns 测试响应
   */
  patch(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;

  /**
   * 发送 DELETE 请求
   * @param path 请求路径
   * @param options 请求选项（可选）
   * @returns 测试响应
   */
  delete(path: string, options?: RequestOptions): Promise<TestResponse>;

  /**
   * 设置单个默认请求头
   * @param name 头名称
   * @param value 头值
   * @returns 当前测试客户端（链式调用）
   */
  setHeader(name: string, value: string): TestClient;

  /**
   * 批量设置默认请求头
   * @param headers 请求头映射
   * @returns 当前测试客户端（链式调用）
   */
  setHeaders(headers: Record<string, string>): TestClient;
}

/**
 * 构建完整 URL
 * @param baseUrl 基础 URL
 * @param path 请求路径
 * @param query 查询参数（可选）
 * @returns 完整 URL 字符串
 */
function buildUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * 合并默认头与覆盖头
 * @param defaults 默认请求头
 * @param overrides 覆盖请求头（可选）
 * @returns 合并后的请求头
 */
function mergeHeaders(
  defaults: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> {
  return { ...defaults, ...overrides };
}

/**
 * 将标准 Response 转换为 TestResponse
 * @param response 标准 fetch Response
 * @returns 测试响应对象
 */
async function buildTestResponse(response: Response): Promise<TestResponse> {
  const text = await response.text();
  let body: unknown = text;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
    text,
    json<T = unknown>(): T {
      if (typeof body === "object" && body !== null) {
        return body as T;
      }
      return JSON.parse(text) as T;
    },
  };
}

/**
 * 创建 HTTP 测试客户端
 * @param baseUrl 基础 URL
 * @returns 测试客户端实例
 */
export function createTestClient(baseUrl: string): TestClient {
  const defaultHeaders: Record<string, string> = {};

  /**
   * 发送 HTTP 请求
   * @param method HTTP 方法
   * @param path 请求路径
   * @param body 请求体（可选）
   * @param options 请求选项（可选）
   * @returns 测试响应
   */
  async function request(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<TestResponse> {
    const url = buildUrl(baseUrl, path, options?.query);
    const headers = mergeHeaders(defaultHeaders, options?.headers);

    const init: RequestInit = { method, headers };

    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        init.body = body;
      } else {
        init.body = JSON.stringify(body);
        if (!headers["content-type"] && !headers["Content-Type"]) {
          (init.headers as Record<string, string>)["content-type"] = "application/json";
        }
      }
    }

    const response = await fetch(url, init);
    return buildTestResponse(response);
  }

  const client: TestClient = {
    get(path, options?) {
      return request("GET", path, undefined, options);
    },
    post(path, body?, options?) {
      return request("POST", path, body, options);
    },
    put(path, body?, options?) {
      return request("PUT", path, body, options);
    },
    patch(path, body?, options?) {
      return request("PATCH", path, body, options);
    },
    delete(path, options?) {
      return request("DELETE", path, undefined, options);
    },
    setHeader(name, value) {
      defaultHeaders[name] = value;
      return client;
    },
    setHeaders(headers) {
      for (const [name, value] of Object.entries(headers)) {
        defaultHeaders[name] = value;
      }
      return client;
    },
  };

  return client;
}
