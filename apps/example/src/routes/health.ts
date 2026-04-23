import type { Router } from "@ventostack/core";
import type { HealthCheck } from "@ventostack/observability";

export function registerHealthRoutes(router: Router, health: HealthCheck): void {
  router.get("/health/live", (ctx) => {
    return ctx.json(health.live());
  });

  router.get("/health/ready", async (ctx) => {
    const status = await health.ready();
    const code = status.status === "ok" ? 200 : 503;
    return ctx.json(status, code);
  });
}
