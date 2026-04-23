// @ventostack/core - WebSocket 路由

/** WebSocket 消息结构 */
export interface WSMessage {
  /** 消息类型 */
  type: string;
  /** 消息数据 */
  data: unknown;
}

/** WebSocket 路由定义 */
export interface WSRoute {
  /** 路径 */
  path: string;
  /** 连接建立回调 */
  open?: (ws: WSConnection) => void;
  /** 消息接收回调 */
  message: (ws: WSConnection, msg: string | Buffer) => void;
  /** 连接关闭回调 */
  close?: (ws: WSConnection, code: number, reason: string) => void;
  /** 缓冲区排空回调 */
  drain?: (ws: WSConnection) => void;
  /** 升级前校验，返回 false 拒绝连接 */
  upgrade?: (req: Request) => boolean | Promise<boolean>;
  /** 附加到 ws.data 的数据 */
  data?: (req: Request) => Record<string, unknown>;
}

/** WebSocket 连接对象 */
export interface WSConnection {
  /** 发送数据 */
  send(data: string | Buffer): void;
  /** 关闭连接 */
  close(code?: number, reason?: string): void;
  /** 附加数据 */
  readonly data: Record<string, unknown>;
  /** 当前连接状态 */
  readonly readyState: number;
}

/** WebSocket 路由器接口 */
export interface WebSocketRouter {
  /**
   * 注册 WebSocket 路由
   * @param path - 路径
   * @param handlers - 路由处理器
   */
  ws(path: string, handlers: Omit<WSRoute, "path">): WebSocketRouter;
  /** 获取所有路由 */
  routes(): readonly WSRoute[];
  /**
   * 生成 Bun.serve() websocket 配置
   * @returns 编译后的配置对象
   */
  compile(): {
    routes: WSRoute[];
    upgrade: (
      req: Request,
      server: { upgrade(req: Request, opts?: { data?: unknown }): boolean },
    ) => boolean;
    handlers: {
      open: (ws: WSConnection) => void;
      message: (ws: WSConnection, msg: string | Buffer) => void;
      close: (ws: WSConnection, code: number, reason: string) => void;
      drain: (ws: WSConnection) => void;
    };
  };
}

/**
 * 创建 WebSocket 路由器
 * @returns WebSocketRouter 实例
 */
export function createWebSocketRouter(): WebSocketRouter {
  const wsRoutes: WSRoute[] = [];

  const router: WebSocketRouter = {
    ws(path, handlers) {
      wsRoutes.push({ path, ...handlers });
      return router;
    },

    routes() {
      return wsRoutes;
    },

    compile() {
      function findRoute(path: string): WSRoute | undefined {
        return wsRoutes.find((r) => {
          if (r.path === path) return true;
          // 简单通配符匹配
          if (r.path.endsWith("/*")) {
            return path.startsWith(r.path.slice(0, -1));
          }
          return false;
        });
      }

      return {
        routes: wsRoutes,
        upgrade(req, server) {
          const url = new URL(req.url);
          const route = findRoute(url.pathname);
          if (!route) return false;
          const data = route.data ? route.data(req) : {};
          (data as Record<string, unknown>).__wsPath = url.pathname;
          return server.upgrade(req, { data });
        },
        handlers: {
          open(ws) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.open?.(ws);
          },
          message(ws, msg) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.message(ws, msg);
          },
          close(ws, code, reason) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.close?.(ws, code, reason);
          },
          drain(ws) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.drain?.(ws);
          },
        },
      };
    },
  };

  return router;
}
