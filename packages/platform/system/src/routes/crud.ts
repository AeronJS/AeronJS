/**
 * @ventostack/system - 通用 CRUD 路由工厂
 *
 * 为角色、菜单、部门、岗位、字典、配置等实体提供统一的路由定义。
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

interface CrudService {
  list: (params: Record<string, unknown>) => Promise<{ items: unknown[]; total: number; page: number; pageSize: number }>;
  getById: (id: string) => Promise<unknown>;
  create: (body: unknown) => Promise<{ id: string }>;
  update: (id: string, body: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface CrudRouteOptions {
  basePath: string;
  resource: string;
  service: CrudService;
  authMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
  extraRoutes?: (router: Router) => void;
}

export function createCrudRoutes(options: CrudRouteOptions): Router {
  const { basePath, resource, service, authMiddleware, perm, extraRoutes } = options;
  const router = createRouter();

  // List
  router.get(`${basePath}`, authMiddleware, perm(resource.split(":")[0]!, `${resource}:list`), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await service.list({ ...(ctx.query as Record<string, unknown>), page, pageSize });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  // Get by ID
  router.get(`${basePath}/:id`, authMiddleware, perm(resource.split(":")[0]!, `${resource}:query`), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const item = await service.getById(id);
    if (!item) return fail("Not found", 404, 404);
    return ok(item);
  });

  // Create
  router.post(`${basePath}`, authMiddleware, perm(resource.split(":")[0]!, `${resource}:create`), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await service.create(body);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Create failed", 400);
    }
  });

  // Update
  router.put(`${basePath}/:id`, authMiddleware, perm(resource.split(":")[0]!, `${resource}:update`), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await service.update(id, body);
    return ok(null);
  });

  // Delete
  router.delete(`${basePath}/:id`, authMiddleware, perm(resource.split(":")[0]!, `${resource}:delete`), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await service.delete(id);
    return ok(null);
  });

  // Extra routes
  if (extraRoutes) {
    extraRoutes(router);
  }

  return router;
}
