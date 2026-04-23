// @ventostack/core - 内部 RPC（service-to-service）

/** RPC 方法定义 */
export interface RPCMethod<TReq = unknown, TRes = unknown> {
  /** 方法名称 */
  name: string;
  /** 方法处理器 */
  handler: (request: TReq) => Promise<TRes>;
}

/** RPC 路由器接口（进程内调用） */
export interface RPCRouter {
  /**
   * 注册 RPC 方法
   * @param name - 方法名称
   * @param handler - 方法处理器
   */
  register<TReq, TRes>(name: string, handler: (request: TReq) => Promise<TRes>): void;
  /**
   * 调用 RPC 方法
   * @param name - 方法名称
   * @param request - 请求参数
   * @returns 响应结果
   */
  call<TReq, TRes>(name: string, request: TReq): Promise<TRes>;
  /** 获取已注册方法列表 */
  methods(): string[];
}

/** RPC 客户端接口（跨服务调用） */
export interface RPCClient {
  /**
   * 调用远程 RPC 方法
   * @param method - 方法名称
   * @param request - 请求参数
   * @returns 响应结果
   */
  call<TReq, TRes>(method: string, request: TReq): Promise<TRes>;
}

/** RPC 客户端配置选项 */
export interface RPCClientOptions {
  /** 基础 URL */
  baseUrl: string;
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 附加请求头 */
  headers?: Record<string, string>;
}

/**
 * 创建内部 RPC 路由器（进程内调用）
 * @returns RPCRouter 实例
 */
export function createRPCRouter(): RPCRouter {
  const handlers = new Map<string, (request: unknown) => Promise<unknown>>();

  return {
    register<TReq, TRes>(name: string, handler: (request: TReq) => Promise<TRes>): void {
      if (handlers.has(name)) {
        throw new Error(`RPC method already registered: ${name}`);
      }
      handlers.set(name, handler as (request: unknown) => Promise<unknown>);
    },

    async call<TReq, TRes>(name: string, request: TReq): Promise<TRes> {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`RPC method not found: ${name}`);
      }
      const result = await handler(request);
      return result as TRes;
    },

    methods(): string[] {
      return Array.from(handlers.keys());
    },
  };
}

/**
 * 创建 HTTP RPC 客户端（跨服务调用）
 * @param options - 客户端配置选项
 * @returns RPCClient 实例
 */
export function createRPCClient(options: RPCClientOptions): RPCClient {
  const { baseUrl, timeout = 30000, headers = {} } = options;

  return {
    async call<TReq, TRes>(method: string, request: TReq): Promise<TRes> {
      const url = `${baseUrl}/rpc/${method}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`RPC call failed: ${method} - ${response.status} ${error}`);
        }

        return (await response.json()) as TRes;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
