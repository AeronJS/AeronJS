// @ventostack/core - gRPC 抽象层（基于 HTTP/2 的类型安全 RPC）

/** gRPC 服务定义 */
export interface ServiceDefinition {
  /** 服务名称 */
  name: string;
  /** 方法定义映射 */
  methods: Record<string, MethodDefinition>;
}

/** gRPC 方法定义 */
export interface MethodDefinition {
  /** 请求类型名称 */
  requestType: string;
  /** 响应类型名称 */
  responseType: string;
  /** 是否为流式方法 */
  streaming?: "client" | "server" | "bidi";
}

/** gRPC 方法处理器 */
export type GRPCHandler<TReq = unknown, TRes = unknown> = (
  request: TReq,
  context: GRPCContext,
) => Promise<TRes>;

/** gRPC 调用上下文 */
export interface GRPCContext {
  /** 元数据 */
  metadata: Map<string, string>;
  /** 截止时间 */
  deadline?: number;
  /** 是否已取消 */
  cancelled: boolean;
}

/** gRPC 服务器接口 */
export interface GRPCServer {
  /**
   * 注册服务
   * @param service - 服务定义
   * @param handlers - 方法处理器映射
   */
  addService(service: ServiceDefinition, handlers: Record<string, GRPCHandler>): void;
  /** 获取所有已注册服务 */
  getServices(): ServiceDefinition[];
  /**
   * 调用服务方法
   * @param serviceName - 服务名称
   * @param methodName - 方法名称
   * @param request - 请求参数
   * @param metadata - 元数据
   * @returns 响应结果
   */
  call<TReq, TRes>(
    serviceName: string,
    methodName: string,
    request: TReq,
    metadata?: Record<string, string>,
  ): Promise<TRes>;
}

/** gRPC 状态 */
export interface GRPCStatus {
  /** 状态码 */
  code: number;
  /** 状态消息 */
  message: string;
}

/** gRPC 状态码常量 */
export const GRPCStatusCode = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  UNAUTHENTICATED: 16,
  UNAVAILABLE: 14,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
} as const;

/** gRPC 错误 */
export class GRPCError extends Error {
  /** 状态码 */
  readonly code: number;
  /**
   * 构造 GRPCError
   * @param code - 状态码
   * @param message - 错误消息
   */
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 创建 gRPC 服务器抽象
 * 内部使用 JSON 序列化（非 protobuf），适合内部服务通信
 * @returns GRPCServer 实例
 */
export function createGRPCServer(): GRPCServer {
  const services = new Map<
    string,
    { definition: ServiceDefinition; handlers: Record<string, GRPCHandler> }
  >();

  return {
    addService(service: ServiceDefinition, handlers: Record<string, GRPCHandler>): void {
      // 验证所有方法都有对应 handler
      for (const methodName of Object.keys(service.methods)) {
        if (!handlers[methodName]) {
          throw new Error(`Missing handler for method: ${service.name}/${methodName}`);
        }
      }
      services.set(service.name, { definition: service, handlers });
    },

    getServices(): ServiceDefinition[] {
      return Array.from(services.values()).map((s) => s.definition);
    },

    async call<TReq, TRes>(
      serviceName: string,
      methodName: string,
      request: TReq,
      metadata?: Record<string, string>,
    ): Promise<TRes> {
      const service = services.get(serviceName);
      if (!service) {
        throw new GRPCError(GRPCStatusCode.NOT_FOUND, `Service not found: ${serviceName}`);
      }

      const method = service.definition.methods[methodName];
      if (!method) {
        throw new GRPCError(
          GRPCStatusCode.UNIMPLEMENTED,
          `Method not found: ${serviceName}/${methodName}`,
        );
      }

      const handler = service.handlers[methodName];
      if (!handler) {
        throw new GRPCError(
          GRPCStatusCode.UNIMPLEMENTED,
          `Handler not found: ${serviceName}/${methodName}`,
        );
      }

      const ctx: GRPCContext = {
        metadata: new Map(Object.entries(metadata ?? {})),
        cancelled: false,
      };

      const result = await handler(request, ctx);
      return result as TRes;
    },
  };
}
