import { createOpenAPIGenerator, syncRouterToOpenAPI } from "@ventostack/openapi";
import type { Router } from "@ventostack/core";

export function setupOpenAPI(router: Router) {
  const generator = createOpenAPIGenerator();

  generator.setInfo({
    title: "VentoStack Example API",
    version: "1.0.0",
    description: "Production-grade example API for VentoStack framework",
  });

  generator.addServer({
    url: "http://localhost:3133",
    description: "Local development server",
  });

  generator.addSecurityScheme("bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });

  syncRouterToOpenAPI(router, generator);

  return generator;
}
