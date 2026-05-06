/**
 * @ventostack/monitor - 监控路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { MonitorService } from "../services/monitor";
import { ok, fail } from "./common";

export function createMonitorRoutes(
  monitorService: MonitorService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 服务器状态
  router.get("/api/system/monitor/server", async () => {
    const status = await monitorService.getServerStatus();
    return ok(status);
  }, perm("system", "monitor:list"));

  // 缓存统计
  router.get("/api/system/monitor/cache", async () => {
    const stats = await monitorService.getCacheStats();
    return ok(stats);
  }, perm("system", "monitor:list"));

  // 数据源状态
  router.get("/api/system/monitor/datasource", async () => {
    const status = await monitorService.getDataSourceStatus();
    return ok(status);
  }, perm("system", "monitor:list"));

  // 健康检查
  router.get("/api/system/monitor/health", async () => {
    const health = await monitorService.getHealthStatus();
    return ok(health);
  }, perm("system", "monitor:list"));

  // 在线用户列表
  router.get("/api/system/monitor/online", async () => {
    const users = await monitorService.getOnlineUsers();
    return ok(users);
  }, perm("system", "online:list"));

  // 强制下线
  router.delete("/api/system/monitor/online/:sessionId", async (ctx) => {
    const sessionId = (ctx.params as Record<string, string>).sessionId!;
    const userId = ctx.query?.userId as string | undefined;
    await monitorService.forceLogout(sessionId, userId ?? "");
    return ok(null);
  }, perm("system", "online:forceLogout"));

  return router;
}
