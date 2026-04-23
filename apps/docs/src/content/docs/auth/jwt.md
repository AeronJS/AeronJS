---
title: JWT 认证
description: 使用 createJWT 实现无状态 JSON Web Token 认证
---

`createJWT` 提供了完整的 JWT 签发和验证功能，基于 Web Crypto API，仅支持 HMAC 算法（HS256 / HS384 / HS512）。

## 基本用法

### 初始化时传入默认密钥

推荐在初始化时配置默认密钥和选项，后续 `sign` / `verify` 无需重复传入：

```typescript
import { createJWT } from "@ventostack/auth";

const jwt = createJWT({
  secret: process.env.JWT_SECRET!,
  defaultOptions: {
    expiresIn: 7 * 24 * 60 * 60, // 7 天，单位：秒
    algorithm: "HS256",
  },
});
```

### 不传入默认密钥（每次调用显式指定）

适用于多租户或多密钥轮换场景：

```typescript
const jwt = createJWT();
```

## 签发 Token

```typescript
// 登录路由 —— 已配置默认密钥时，无需再传 secret
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.request.json() as { email: string; password: string };

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError("邮箱或密码错误");
  }

  // 使用默认 secret 和 expiresIn
  const token = await jwt.sign({
    sub: String(user.id),
    email: user.email,
    role: user.role,
  });

  return ctx.json({ token, expiresIn: "7d" });
});
```

也可以在单次调用中覆盖默认配置：

```typescript
// 短期访问 Token（覆盖默认过期时间）
const accessToken = await jwt.sign(
  { sub: user.id, type: "access" },
  undefined, // 使用默认 secret
  { expiresIn: 15 * 60 } // 15 分钟
);
```

## 验证 Token

```typescript
// 认证中间件 —— 已配置默认密钥时，无需再传 secret
const authMiddleware: Middleware = async (ctx, next) => {
  const authHeader = ctx.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("缺少认证 Token");
  }

  const token = authHeader.slice(7);

  try {
    const payload = await jwt.verify(token);
    ctx.state.set("user", payload);
  } catch (err) {
    throw new UnauthorizedError("Token 无效或已过期");
  }

  return next();
};
```

## 刷新 Token

```typescript
// 签发双 Token
const accessToken = await jwt.sign({ sub: user.id, type: "access" }, undefined, { expiresIn: 15 * 60 });
const refreshToken = await jwt.sign({ sub: user.id, type: "refresh" }, undefined, { expiresIn: 30 * 24 * 60 * 60 });

// 使用刷新 Token 获取新的访问 Token
router.post("/auth/refresh", async (ctx) => {
  const { refreshToken } = await ctx.request.json() as { refreshToken: string };

  const payload = await jwt.verify(refreshToken);
  if (payload.type !== "refresh") {
    throw new UnauthorizedError("无效的刷新 Token");
  }

  const newAccessToken = await jwt.sign({ sub: payload.sub, type: "access" }, undefined, { expiresIn: 15 * 60 });
  return ctx.json({ accessToken: newAccessToken });
});
```

## JWT 接口

```typescript
type JWTAlgorithm = "HS256" | "HS384" | "HS512";

interface JWTPayload {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

interface JWTOptions {
  algorithm?: JWTAlgorithm; // 默认 "HS256"
  issuer?: string;
  audience?: string;
  expiresIn?: number;       // 单位：秒
}

interface JWTConfig {
  secret?: string;          // 默认密钥
  defaultOptions?: JWTOptions; // 默认选项
}

interface JWTManager {
  sign(payload: JWTPayload, secret?: string, options?: JWTOptions): Promise<string>;
  verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload>;
  decode(token: string): JWTPayload | null;
}
```

## 安全约束

- 密钥长度必须 >= 32 字节（256-bit），否则 `sign` / `verify` 会直接抛错
- 仅支持 `HS256`、`HS384`、`HS512`，不支持 `RS256` / `RS384` / `RS512`
- 签名验证使用 `crypto.subtle.verify`，恒定时间比较，防止时序攻击
- 生产环境密钥应支持版本化与轮换，禁止硬编码在代码中
