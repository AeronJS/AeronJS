---
title: 项目结构
description: VentoStack 推荐的项目结构和文件组织方式
---

## 推荐结构

```
my-ventostack-app/
  src/
    main.ts              - 应用入口
    routes/              - 路由模块
      users.ts
      auth.ts
    middleware/          - 中间件
      auth.ts
      logger.ts
    services/            - 业务逻辑
      user-service.ts
    db/                  - 数据库相关
      migrations/
        001_create_users.ts
      schema.ts
    config.ts            - 应用配置
  package.json
  tsconfig.json
  bunfig.toml
```

## 入口文件

`src/main.ts` 负责组装所有模块：

```typescript
import { createApp } from "@ventostack/core";
import { createLogger } from "@ventostack/observability";
import { usersRouter } from "./routes/users";
import { authRouter } from "./routes/auth";
import { loggerMiddleware } from "./middleware/logger";
import { config } from "./config";

const logger = createLogger({ level: config.logLevel });
const app = createApp({ port: config.port });

// 中间件
app.use(loggerMiddleware(logger));

// 路由
app.use(authRouter());
app.use(usersRouter());

app.lifecycle.onAfterStart(() => logger.info("Server started", { port: config.port }));
app.lifecycle.onBeforeStop(() => logger.info("Server stopped"));

await app.listen();
```

## 路由模块

每个路由文件返回一个 router 实例：

```typescript
// src/routes/users.ts
import { createRouter } from "@ventostack/core";
import { defineModel, column } from "@ventostack/database";
import type { Database } from "@ventostack/database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 255 }),
  email: column.varchar({ length: 255, unique: true }),
});

export function usersRouter(db: Database) {
  const router = createRouter();

  router.get("/users", async (ctx) => {
    const users = await db.query(UserModel).list();
    return ctx.json(users);
  });

  router.post("/users", async (ctx) => {
    const body = await ctx.body<{ name: string; email: string }>();
    const user = await db.query(UserModel).insert(body, { returning: true });
    return ctx.json(user, 201);
  });

  router.get("/users/:id<int>", async (ctx) => {
    const user = await db.query(UserModel).where("id", "=", ctx.params.id).get();
    if (!user) return ctx.json({ error: "Not found" }, 404);
    return ctx.json(user);
  });

  return router;
}
```

## 配置文件

```typescript
// src/config.ts
import { createConfig } from "@ventostack/core";

export const config = createConfig({
  port: { type: "number", env: "PORT", default: 3000 },
  logLevel: { type: "string", env: "LOG_LEVEL", default: "info" },
  databaseUrl: { type: "string", env: "DATABASE_URL", required: true },
  jwtSecret: { type: "string", env: "JWT_SECRET", required: true, sensitive: true },
}, process.env);
```

## Monorepo 结构

对于大型项目，推荐使用 Bun workspaces：

```
my-project/
  apps/
    api/                 - 后端 API
    admin/               - 管理后台
  packages/
    shared/              - 共享类型和工具
    ui/                  - 前端组件库
  package.json           - 根 package.json（workspaces 配置）
  bun.lock
```

根 `package.json`：

```json
{
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun --hot apps/api/src/main.ts",
    "test": "bun test"
  }
}
```
