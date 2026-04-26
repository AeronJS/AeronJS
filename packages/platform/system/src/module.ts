/**
 * @ventostack/system - 模块聚合
 * 一键创建系统管理模块，注册所有 Service、路由和中间件
 */

import { createRouter } from "@ventostack/core";
import type { Router } from "@ventostack/core";
import type { JWTManager, PasswordHasher, TOTPManager, RBAC, RowFilter, AuthSessionManager, TokenRefreshManager, SessionManager, MultiDeviceManager } from "@ventostack/auth";
import type { Cache } from "@ventostack/cache";
import type { AuditStore } from "@ventostack/observability";
import type { EventBus } from "@ventostack/events";

import { createAuthService } from "./services/auth";
import { createUserService } from "./services/user";
import { createRoleService } from "./services/role";
import { createMenuService } from "./services/menu";
import { createDeptService } from "./services/dept";
import { createPostService } from "./services/post";
import { createDictService } from "./services/dict";
import { createConfigService } from "./services/config";
import { createNoticeService } from "./services/notice";
import { createPermissionLoader } from "./services/permission-loader";
import { createMenuTreeBuilder } from "./services/menu-tree-builder";

import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createOperationLogMiddleware } from "./middlewares/operation-log";
import { createAuthRoutes } from "./routes/auth";
import { createUserRoutes } from "./routes/user";
import { createCrudRoutes } from "./routes/crud";
import { ok, okPage, fail, parseBody, pageOf } from "./routes/common";

export interface SystemModule {
  services: {
    auth: ReturnType<typeof createAuthService>;
    user: ReturnType<typeof createUserService>;
    role: ReturnType<typeof createRoleService>;
    menu: ReturnType<typeof createMenuService>;
    dept: ReturnType<typeof createDeptService>;
    post: ReturnType<typeof createPostService>;
    dict: ReturnType<typeof createDictService>;
    config: ReturnType<typeof createConfigService>;
    notice: ReturnType<typeof createNoticeService>;
    permissionLoader: ReturnType<typeof createPermissionLoader>;
    menuTreeBuilder: ReturnType<typeof createMenuTreeBuilder>;
  };
  router: Router;
  init(): Promise<void>;
}

export interface SystemModuleDeps {
  executor: (text: string, params?: unknown[]) => Promise<unknown[]>;
  cache: Cache;
  jwt: JWTManager;
  jwtSecret: string;
  passwordHasher: PasswordHasher;
  totp: TOTPManager;
  rbac: RBAC;
  rowFilter: RowFilter;
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  authSessionManager: AuthSessionManager;
  auditLog: AuditStore;
  eventBus: EventBus;
}

export function createSystemModule(deps: SystemModuleDeps): SystemModule {
  const { executor, cache, jwt, jwtSecret, passwordHasher, totp, rbac, rowFilter, auditLog, authSessionManager, eventBus } = deps;

  // Services
  const authService = createAuthService({ executor, cache, jwt, jwtSecret, passwordHasher, totp, authSessionManager, auditLog, eventBus });
  const userService = createUserService({ executor, passwordHasher, cache });
  const roleService = createRoleService({ executor, cache });
  const menuService = createMenuService({ executor });
  const deptService = createDeptService({ executor });
  const postService = createPostService({ executor });
  const dictService = createDictService({ executor, cache });
  const configService = createConfigService({ executor, cache });
  const noticeService = createNoticeService({ executor });
  const permissionLoader = createPermissionLoader({ executor, rbac, rowFilter });
  const menuTreeBuilder = createMenuTreeBuilder({ executor });

  // Middlewares
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);
  const opLogMiddleware = createOperationLogMiddleware(auditLog);

  // Routes
  const router = createRouter();
  router.use(createAuthRoutes(authService, authMiddleware).routes());
  router.use(createUserRoutes(userService, authMiddleware, perm).routes());

  // CRUD routes for other entities
  router.use(createCrudRoutes({
    basePath: "/api/system/roles",
    resource: "system:role",
    service: roleService,
    authMiddleware,
    perm,
  }).routes());

  router.use(createCrudRoutes({
    basePath: "/api/system/menus",
    resource: "system:menu",
    service: { ...menuService, update: (id: string, body: any) => menuService.update(id, body) },
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/menus/tree", authMiddleware, perm("system", "menu:list"), async () => {
        const tree = await menuService.getTree();
        return new Response(JSON.stringify({ code: 0, data: tree }), { headers: { "Content-Type": "application/json" } });
      });
    },
  }).routes());

  router.use(createCrudRoutes({
    basePath: "/api/system/depts",
    resource: "system:dept",
    service: deptService,
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/depts/tree", authMiddleware, perm("system", "dept:list"), async () => {
        const tree = await deptService.getTree();
        return new Response(JSON.stringify({ code: 0, data: tree }), { headers: { "Content-Type": "application/json" } });
      });
    },
  }).routes());

  router.use(createCrudRoutes({
    basePath: "/api/system/posts",
    resource: "system:post",
    service: postService,
    authMiddleware,
    perm,
  }).routes());

  router.use(createCrudRoutes({
    basePath: "/api/system/dict/types",
    resource: "system:dict",
    service: dictService,
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/dict/types/:code/data", authMiddleware, async (ctx) => {
        const code = (ctx.params as Record<string, string>).code;
        const data = await dictService.listDataByType(code);
        return new Response(JSON.stringify({ code: 0, data }), { headers: { "Content-Type": "application/json" } });
      });
    },
  }).routes());

  router.use(createCrudRoutes({
    basePath: "/api/system/configs",
    resource: "system:config",
    service: { ...configService, update: (key: string, body: any) => configService.update(key, body) },
    authMiddleware,
    perm,
  }).routes());

  router.use(createCrudRoutes({
    basePath: "/api/system/notices",
    resource: "system:notice",
    service: noticeService,
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.put("/api/system/notices/:id/publish", authMiddleware, perm("system", "notice:update"), async (ctx) => {
        const id = (ctx.params as Record<string, string>).id;
        const user = ctx.user as { id: string };
        await noticeService.publish(id, user.id);
        return new Response(JSON.stringify({ code: 0, data: null }), { headers: { "Content-Type": "application/json" } });
      });
      r.put("/api/system/notices/:id/read", authMiddleware, async (ctx) => {
        const id = (ctx.params as Record<string, string>).id;
        const user = ctx.user as { id: string };
        await noticeService.markRead(user.id, id);
        return new Response(JSON.stringify({ code: 0, data: null }), { headers: { "Content-Type": "application/json" } });
      });
    },
  }).routes());

  // User self-service routes
  router.get("/api/system/user/profile", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string };
    const detail = await userService.getById(user.id);
    if (!detail) return ok(null);
    const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
    const roles = (detail as Record<string, unknown>).roles as Array<{ code: string }> ?? [];
    return ok({
      ...detail,
      roles: roles.map((r: { code: string }) => r.code),
      permissions,
    });
  });

  router.get("/api/system/user/routes", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string };
    const routes = await menuTreeBuilder.buildRoutesForUser(user.id);
    return new Response(JSON.stringify({ code: 0, data: routes }), { headers: { "Content-Type": "application/json" } });
  });

  router.get("/api/system/user/permissions", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string };
    const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
    return new Response(JSON.stringify({ code: 0, data: permissions }), { headers: { "Content-Type": "application/json" } });
  });

  // === Dict data CRUD (separate from dict type CRUD) ===
  router.post("/api/system/dict/data", authMiddleware, perm("system", "dict:create"), async (ctx) => {
    const body = await parseBody(ctx.request);
    const result = await dictService.createData(body as any);
    return ok(result);
  });
  router.put("/api/system/dict/data/:id", authMiddleware, perm("system", "dict:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await dictService.updateData(id, body as any);
    return ok(null);
  });
  router.delete("/api/system/dict/data/:id", authMiddleware, perm("system", "dict:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await dictService.deleteData(id);
    return ok(null);
  });

  // === Notice revoke ===
  router.put("/api/system/notices/:id/revoke", authMiddleware, perm("system", "notice:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await noticeService.revoke(id);
    return ok(null);
  });

  // === Operation logs (read-only) ===
  const opLogPerm = perm("system", "log:list");
  router.get("/api/system/operation-logs", authMiddleware, opLogPerm, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.username) { conditions.push(`username LIKE $${idx++}`); params.push(`%${q.username}%`); }
    if (q.module) { conditions.push(`module = $${idx++}`); params.push(q.module); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const countResult = await executor(`SELECT COUNT(*) as cnt FROM sys_operation_log ${where}`, params);
    const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await executor(
      `SELECT * FROM sys_operation_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    return okPage(rows as any[], total, page, pageSize);
  });

  // === Login logs (read-only) ===
  router.get("/api/system/login-logs", authMiddleware, opLogPerm, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.username) { conditions.push(`username LIKE $${idx++}`); params.push(`%${q.username}%`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const countResult = await executor(`SELECT COUNT(*) as cnt FROM sys_login_log ${where}`, params);
    const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await executor(
      `SELECT * FROM sys_login_log ${where} ORDER BY login_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    return okPage(rows as any[], total, page, pageSize);
  });

  return {
    services: {
      auth: authService, user: userService, role: roleService, menu: menuService,
      dept: deptService, post: postService, dict: dictService, config: configService,
      notice: noticeService, permissionLoader, menuTreeBuilder,
    },
    router,
    async init() {
      await permissionLoader.loadAll();
    },
  };
}
