#!/usr/bin/env bun
/**
 * @ventostack/backend — 管理后台服务端
 *
 * 职责仅限于：生命周期管理、顶层错误边界。
 * 优雅关停由框架 createApp 内置的 SIGTERM/SIGINT 处理。
 * 业务装配逻辑全部委托给 app.ts（Composition Root）。
 *
 * 启动方式：
 *   bun run src/index.ts                          # 开发模式
 *   NODE_ENV=production bun run src/index.ts      # 生产模式
 *
 * 环境变量参考 .env.example
 */

import { env } from "./config";
import { buildApp, type AppContext } from "./app";

let appCtx: AppContext | null = null;

async function main(): Promise<void> {
  console.log("");

  appCtx = await buildApp();

  // 框架 createApp.listen() 内部注册了 SIGTERM/SIGINT 处理：
  // 1. 设置 isClosing=true，新请求返回 503
  // 2. 等待活跃请求最多 30 秒
  // 3. 执行 lifecycle.onBeforeStop()
  // 4. 关闭 HTTP 服务
  // 5. process.exit(0)
  await appCtx.app.listen();

  console.log(`[server] Listening on http://${env.HOST}:${env.PORT}`);
  console.log(`[server] Environment: ${env.NODE_ENV}`);
  console.log(`[server] API:       http://${env.HOST}:${env.PORT}/api`);
  console.log(`[server] OpenAPI:   http://${env.HOST}:${env.PORT}/openapi.json`);
  console.log(`[server] Docs:      http://${env.HOST}:${env.PORT}/docs`);
  console.log("");
}

// ===============================================
// 顶层错误边界 — 捕获启动阶段的不可恢复错误
// ===============================================

main().catch((err) => {
  console.error("[fatal] Startup failed:");
  console.error(err);
  process.exit(1);
});
