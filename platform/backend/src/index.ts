#!/usr/bin/env bun
/**
 * @ventostack/backend — 管理后台服务端入口
 *
 * 组装框架层和平台层能力，为 @ventostack/admin 提供完整 REST API。
 *
 * 前置条件：
 *   需要 PostgreSQL 数据库（参见 docker-compose.yml）
 *
 * 启动方式：
 *   bun run src/index.ts                                    # 默认连接 localhost:5432
 *   DATABASE_URL=postgres://user:pass@host:5432/db bun run src/index.ts
 *   PORT=8080 bun run src/index.ts
 */

import { createApp, cors, requestId, requestLogger } from "@ventostack/core";
import { createDatabase, createMigrationRunner, createSeedRunner } from "@ventostack/database";
import { createCache, createMemoryAdapter } from "@ventostack/cache";
import {
  createJWT,
  createPasswordHasher,
  createRBAC,
  createRowFilter,
  createTOTP,
  createSessionManager,
  createMemorySessionStore,
  createMultiDeviceManager,
  createTokenRefresh,
  createMemoryRevocationStore,
  createAuthSessionManager,
} from "@ventostack/auth";
import { createAuditLog } from "@ventostack/observability";
import { createEventBus } from "@ventostack/events";
import { createSystemModule, createSysTables, initAdminSeed } from "@ventostack/system";

/* ================================================================
 * Configuration
 * ================================================================ */

const {
  PORT = "8080",
  HOST = "0.0.0.0",
  DATABASE_URL = "postgres://postgres:postgres@localhost:5432/ventostack",
  JWT_SECRET = "change-me-in-production-min-32-chars!!",
} = process.env;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",");

/* ================================================================
 * Database
 * ================================================================ */

console.log(`[backend] Connecting: ${DATABASE_URL}`);
const db = createDatabase({ url: DATABASE_URL });
const executor = (text: string, params?: unknown[]) => db.raw(text, params);

/* ================================================================
 * Cache
 * ================================================================ */

const cache = createCache(createMemoryAdapter());

/* ================================================================
 * Auth Engines
 * ================================================================ */

const jwt = createJWT({ secret: JWT_SECRET });
const passwordHasher = createPasswordHasher();
const rbac = createRBAC();
const rowFilter = createRowFilter();
const totp = createTOTP({ algorithm: "SHA-256" });

const sessionStore = createMemorySessionStore();
const sessionManager = createSessionManager(sessionStore, { ttl: 30 * 60 });
const deviceManager = createMultiDeviceManager({ maxDevices: 5, overflowStrategy: "kickOldest" });
const revocationStore = createMemoryRevocationStore();
const tokenRefresh = createTokenRefresh(jwt, { revocationStore });
const authSessionManager = createAuthSessionManager({ sessionManager, deviceManager, tokenRefresh, jwt });

/* ================================================================
 * Observability & Events
 * ================================================================ */

const auditLog = createAuditLog();
const eventBus = createEventBus();

/* ================================================================
 * System Module
 * ================================================================ */

const system = createSystemModule({
  executor,
  cache,
  jwt,
  jwtSecret: JWT_SECRET,
  passwordHasher,
  totp,
  rbac,
  rowFilter,
  sessionManager,
  deviceManager,
  tokenRefresh,
  authSessionManager,
  auditLog,
  eventBus,
});

/* ================================================================
 * Application
 * ================================================================ */

const app = createApp({ port: parseInt(PORT, 10), hostname: HOST });

app.use(requestId());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(requestLogger());
app.use(system.router);

/* ================================================================
 * Startup
 * ================================================================ */

async function main() {
  // 1. Run migrations
  console.log("[backend] Running database migrations...");
  const migrationRunner = createMigrationRunner(executor);
  migrationRunner.addMigration(createSysTables);
  await migrationRunner.up();
  console.log("[backend] Migrations complete");

  // 2. Seed admin user (idempotent)
  const [existing] = await executor(
    `SELECT id FROM sys_user WHERE username = 'admin' LIMIT 1`,
  ) as Array<{ id: string }>;

  if (!existing) {
    console.log("[backend] Creating seed data...");
    const seedRunner = createSeedRunner(executor);
    seedRunner.addSeed(initAdminSeed);
    await seedRunner.run();
    console.log("[backend] Seed data created — admin / admin123");
  } else {
    console.log("[backend] Seed data exists, skipping");
  }

  // 3. Load permissions into RBAC engine
  await system.init();
  console.log("[backend] RBAC permissions loaded");

  // 4. Start HTTP server
  await app.listen();
  console.log(`[backend] Ready at http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("[backend] Fatal:", err);
  process.exit(1);
});
