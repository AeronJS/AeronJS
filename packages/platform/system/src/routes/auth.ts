/**
 * @ventostack/system - 认证路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { AuthService } from "../services/auth";
import { ok, fail, parseBody } from "./common";

export function createAuthRoutes(
  authService: AuthService,
  authMiddleware: Middleware,
): Router {
  const router = createRouter();

  router.post("/api/auth/login", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.login({
        username: body.username as string,
        password: body.password as string,
        ip: ctx.request.headers.get("x-forwarded-for") ?? "unknown",
        userAgent: ctx.request.headers.get("user-agent") ?? "unknown",
        deviceType: body.deviceType as string | undefined,
      });
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      return fail(msg, 401, 401);
    }
  });

  router.post("/api/auth/logout", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (user) {
      await authService.logout(user.id, "");
    }
    return ok(null);
  });

  router.post("/api/auth/refresh", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.refreshToken(body.refreshToken as string);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Refresh failed";
      return fail(msg, 401, 401);
    }
  });

  router.post("/api/auth/register", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.register({
        username: body.username as string,
        password: body.password as string,
        email: body.email as string | undefined,
        phone: body.phone as string | undefined,
      });
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Register failed";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/forgot-password", async (ctx) => {
    const body = await parseBody(ctx.request);
    // placeholder: send reset email
    return ok({ email: body.email });
  });

  router.post("/api/auth/reset-password", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      await authService.resetPassword(body.userId as string, body.newPassword as string);
      return ok(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reset failed";
      return fail(msg, 400);
    }
  });

  // MFA endpoints
  router.post("/api/auth/mfa/enable", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string };
    const result = await authService.enableMFA(user.id);
    return ok(result);
  });

  router.post("/api/auth/mfa/verify", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    const valid = await authService.verifyMFA(user.id, body.code as string);
    return ok({ valid });
  });

  router.post("/api/auth/mfa/disable", authMiddleware, async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    await authService.disableMFA(user.id, body.code as string);
    return ok(null);
  });

  router.post("/api/auth/mfa/recover", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.recoverMFA(body.userId as string, body.recoveryCode as string);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Recovery failed";
      return fail(msg, 401, 401);
    }
  });

  return router;
}
