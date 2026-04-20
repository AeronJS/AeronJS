# Aeron — Bun 全栈框架

> 成为 Bun 生态中最完整、最工程化、默认安全的全栈框架。
>
> 当前阶段：优先把后端核心层、数据层、认证授权、安全基线与工程化能力打牢；前端能力先定义边界与契约，不反向绑死后端架构。

---

## 1. Project Positioning

Aeron 是基于 Bun 运行时构建的全栈框架，但当前研发重心明确放在后端基础设施。

当前阶段目标：
- 极致利用 Bun 原生能力：HTTP、SQL、Redis、Worker、构建、测试
- 100% 类型安全，避免运行时反射与隐式依赖
- 无 class、无 DI 容器、显式依赖注入、函数式优先
- 默认安全、默认可审计、默认可测试、默认可观测
- 为后续前端集成预留稳定契约：OpenAPI、类型生成、认证会话、BFF/SSR 适配

当前阶段非目标：
- 不做 Node-first 兼容层
- 不引入 Express/Fastify/Koa 风格的重量级抽象
- 不为了“像 Spring/Nest”而引入 class、装饰器反射或容器定位

---

## 2. Architecture

### 分层模型

```
┌────────────────────────────────────────────────────┐
│ Apps / CLI / OpenAPI / AI / Testing / Future Web  │  ← 接入层
├────────────────────────────────────────────────────┤
│ Auth / Cache / Events / Observability / Policy    │  ← 能力层
├────────────────────────────────────────────────────┤
│ Database / Queue / Storage / Scheduler            │  ← 数据与基础设施层
├────────────────────────────────────────────────────┤
│ Core (Router / Context / Middleware / Lifecycle)  │  ← 核心框架层
├────────────────────────────────────────────────────┤
│ Bun Runtime (serve/sql/redis/worker/build/test)   │  ← 运行时层
└────────────────────────────────────────────────────┘
```

### 信任边界

所有设计、实现和评审都必须显式考虑以下边界：

1. Edge Boundary：浏览器、移动端、Webhook 调用方、第三方 API、反向代理
2. App Boundary：Router、Middleware、Handler、Validation、Context
3. Data Boundary：数据库、Redis、对象存储、队列、定时任务
4. Control Boundary：CLI、迁移、代码生成、OpenAPI、管理接口
5. AI Boundary：Tool Registry、Prompt、Memory、Worker、审批流
6. Runtime Boundary：容器、宿主机、Kubernetes、CI/CD、供应链

规则：跨边界传入的数据默认不可信，必须显式校验、约束、审计。

### 模块边界

| Package | 职责 | 依赖约束 |
|---------|------|----------|
| core | HTTP 路由、Context、中间件、错误处理、生命周期 | 不依赖上层能力包 |
| database | ORM、迁移、事务、连接策略 | 只依赖 core |
| cache | Redis 封装、缓存策略、分布式锁 | 只依赖 core |
| auth | JWT、Session、API Key、权限校验 | 依赖 core、database、cache |
| events | 事件总线、任务调度、异步处理 | 依赖 core |
| observability | 日志、指标、链路追踪、审计 | 依赖 core |
| openapi | 文档与契约生成 | 依赖 core |
| ai | Tool 调用、Worker 隔离、审批与审计 | 依赖 core、auth、observability |
| cli | 脚手架、构建、迁移、生成命令 | 可依赖所有包 |
| testing | 测试工具、Fixture、测试容器与隔离封装 | 依赖 core 与目标包 |

---

## 3. Bun-First Tech Stack

### 优先级

1. Bun 内置 API
2. Web 标准 API
3. Bun 的 Node 兼容 API
4. 第三方包

### 核心选型

| 能力 | 首选 | 明确约束 |
|------|------|----------|
| HTTP | Bun.serve() | 不引入 Express/Fastify/Koa |
| SQL | Bun.sql + 标签模板 | 不引入 pg/mysql2 作为主路径 |
| Redis | Bun 原生 Redis 能力 | 不引入 ioredis 作为默认方案 |
| 密码哈希 | Bun.password | 不引入 bcrypt/argon2 包 |
| 加密签名 | crypto.subtle / Bun.CryptoHasher / node:crypto 兼容层 | 算法白名单、禁止弱算法 |
| 文件 I/O | Bun.file() / Bun.write() | 不引入 fs-extra 作为默认方案 |
| Shell / 子进程 | $ from bun / Bun.spawn() | 避免 child_process 风格抽象 |
| 测试 | bun:test | 不引入 Jest/Vitest |
| 构建 | bun build | 不引入 esbuild/rollup 作为默认构建链 |

### 自研组件

| 组件 | 原因 |
|------|------|
| Router | Bun 原生路由之上补齐分组、中间件、元数据、编译期类型推导 |
| ORM | 基于 Bun.sql 的轻量抽象，避免 class 模型和额外生成步骤 |
| Validator | 精确类型推导、树摇友好、无运行时反射 |
| JWT/Auth | 完全控制算法白名单、密钥管理与多租户权限边界 |
| AI Sandbox | Bun Worker + 显式权限模型，避免任意执行 |

---

## 4. Engineering Conventions

### 无 Class

全部使用函数和工厂函数。状态通过闭包或显式对象传递。

```typescript
function createUserService(deps: { db: Database; cache: Cache }) {
  return {
    async findById(id: string) {
      return deps.db.query(UserModel).where((user) => user.id.eq(id)).get();
    },
  };
}
```

### 无 DI 容器

依赖显式传递，禁止字符串定位或运行时反射解析。

```typescript
const userService = createUserService({ db, cache });
const authService = createAuthService({ db, cache, userService });
```

禁止：

```typescript
container.get("UserService");
container.get(UserService);
```

### TypeScript Strict Mode

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### SQL 调用规范

标签模板字面量是唯一正确调用方式。

```typescript
const users = await sql`SELECT * FROM users WHERE id = ${id}`;
```

禁止：

```typescript
await sql.query("SELECT * FROM users WHERE id = $1", [id]);
await db.select("users").where({ id });
```

### 代码组织原则

- 小而清晰的模块优先，按职责切分，不按“技术层名词堆叠”切分
- 文件之间的依赖方向必须单向、可解释、可测试
- 所有逃生舱口都必须显式命名，例如 raw SQL、unsafe HTML、trusted proxy
- 可观测默认可关闭，但关闭时必须是 no-op，不允许偷偷留副作用

---

## 5. Security Baseline

### 5.1 威胁模型

以下输入一律视为不可信：

- Path、Query、Header、Cookie、Body、Form、File、WebSocket Payload
- OpenAPI 输入、CLI 参数、环境变量、YAML/TOML 配置
- 第三方 Webhook、OAuth Profile、外部 API 返回值
- AI Prompt、Tool 参数、Memory 内容、RAG 文档片段

默认原则：

- 默认拒绝，不默认信任
- 默认最小权限，不默认全开
- 默认脱敏，不默认暴露细节
- 默认隔离，不默认共享运行时与数据

### 5.2 Web 攻击面

必须覆盖以下默认防护：

- 输入校验：所有入口强制 Schema 校验
- 大小限制：请求体、JSON 深度、数组长度、字符串长度、上传文件大小都必须有上限
- 编码安全：拒绝异常编码、空字节、危险内容类型混淆
- XSS：输出编码优先；只有显式标记的 HTML 才允许进入渲染链，且必须先做清洗
- CSRF：凡是基于 Cookie 的认证，必须同时启用 SameSite 和 CSRF Token；WebSocket 握手同样校验来源与 token
- CORS：默认 deny，禁止 credentials + wildcard origin 组合
- SSRF：所有出站请求必须可审计、可限流、可配置 allowlist；默认拒绝访问回环、本地链路和云元数据地址
- Open Redirect：所有跳转目标必须校验来源、域名或签名
- Upload：校验扩展名、MIME、大小、数量、目标存储路径；不得直接信任客户端文件名
- Brute Force：登录、验证码、找回密码、签名校验等高敏感接口必须限流和审计

### 5.3 身份、授权与多租户

JWT / Session / API Key / HMAC 的统一要求：

- JWT 仅允许 HS256、HS384、HS512、ES256、EdDSA
- 密钥最小 256-bit，必须支持版本号与轮换窗口
- Access Token 与 Refresh Token 必须分离，不共用密钥与生命周期
- 使用恒定时间比较 helper 做签名比对，禁止普通字符串比较
- HMAC 签名必须包含 timestamp + nonce + canonical request，nonce 去重必须使用原子操作
- API Key 必须哈希后存储，不允许明文持久化
- Session Cookie 必须设置 HttpOnly、Secure、SameSite 和明确 Path/Domain
- RBAC/ABAC 默认 deny，显式授权
- 多租户场景下 tenant context 必须成为必需依赖，而不是可选装饰
- 缓存 key、队列 key、审计记录、对象存储路径必须带 tenant namespace
- 原生 SQL 或绕过 ORM 的路径必须显式声明 tenant filter 策略

### 5.4 Secrets 与配置安全

- Secret 不进仓库，不写死在默认配置中
- 生产环境优先接入 Vault / KMS / Secret Manager，而不是长期依赖静态环境变量
- 所有密钥必须支持版本化、轮换和吊销
- 生产启动前必须执行安全预检：关键 secret 缺失、过短、调试开关开启、HTTPS 未启用时直接拒绝启动
- 配置打印、错误日志、trace、审计日志里一律不输出原始 secret

### 5.5 可观测与信息泄露

- 生产环境不返回堆栈信息、SQL 细节、内部拓扑、依赖版本
- 默认脱敏字段至少包含：password、token、secret、key、cookie、authorization、phone、email、idcard、银行卡号
- 默认不记录完整请求体；确需记录时必须按字段白名单采集
- /docs、/openapi.json、/metrics、/debug、/ready 等端点必须按环境或权限控制暴露范围
- 审计日志记录谁、在何时、对什么资源做了什么操作以及结果，但不能泄露敏感载荷

### 5.6 AI / Tool 安全

- 所有 Tool 输入必须做 Schema 校验，必要时对输出同样做结构校验
- 只允许显式注册的 Tool；禁止任意 shell、任意文件访问、任意 SQL
- AI Worker 必须具备超时、内存、CPU、文件系统、网络出站约束
- 敏感操作默认需要人工审批，不允许模型自批准
- 每次 Tool 调用都必须有审计记录：发起者、参数摘要、结果摘要、耗时、审批链
- Prompt、Memory、RAG 文档视为不可信输入，避免 prompt injection 直接穿透到执行面

### 5.7 供应链安全

- bun.lock 必须提交到仓库并参与评审
- 第三方依赖默认 pin 版本，禁止无审查的宽松升级
- 新增依赖必须说明：为什么 Bun 内置能力不够、替代方案是什么、安全边界是什么
- 安装脚本、postinstall、动态下载二进制必须单独评估
- 构建链需支持依赖漏洞扫描与产物溯源

---

## 6. Runtime Isolation And Deployment

容器与集群部署默认基线：

- 非 root 运行
- 根文件系统只读
- allowPrivilegeEscalation=false
- drop ALL Linux capabilities，按需最小增补
- seccomp 使用 RuntimeDefault 或更严格策略
- 仅挂载必要的可写目录，例如 /tmp
- 显式配置 CPU / memory request 与 limit，避免资源耗尽拖垮节点
- 默认最小 ServiceAccount 权限
- 使用 NetworkPolicy 限制东西向与南北向流量
- 仅信任配置过的反向代理 IP/CIDR，不能盲信 X-Forwarded-* 头
- readiness / liveness / startup probe 分离，优雅关闭期间先摘流量再停服务

运行时规则：

- 所有对外 header 推断都必须有 trusted proxy 前提
- 不能把宿主机、容器、Kubernetes 当成可信环境
- 管理端口、调试端口、内部指标端口与业务端口必须分离

---

## 7. Fullstack Direction

项目目标是全栈，但当前不急于实现重前端抽象。后续全栈能力应围绕后端契约自然生长：

- 从路由元数据 / OpenAPI 生成类型安全客户端
- 提供服务端 session / token 与前端 SDK 的统一契约
- 支持 BFF、SSR、Streaming、Server Action 等接入层适配
- 复用同一套 schema 做服务端校验与前端表单校验
- 支持后端事件驱动的缓存失效与前端数据同步接口

原则：先把后端协议、权限模型和安全边界设计稳定，再决定前端 API 形态。

---

## 8. Testing And Verification

### 测试框架

- 使用 bun:test
- 测试文件命名：*.test.ts

### 测试要求

- 每个公共函数必须有单元测试
- 每个 HTTP 端点必须有集成测试
- 认证、授权、租户隔离、签名校验、限流、上传限制必须有安全回归测试
- 数据库测试必须可隔离、可回滚、可重复执行
- 优先 mock 外部服务，不 mock 框架核心模块
- 所有高风险特性在合并前都要经过一次安全审计视角复查

### 交付前检查

- 类型检查通过
- 测试通过
- 安全关键路径有失败用例覆盖
- 默认配置在生产模式下不会以不安全方式启动
- 文档、示例、生成代码与实际行为一致

---

## 9. Directory Structure

```
fullstack/
├── packages/
│   ├── core/
│   ├── database/
│   ├── cache/
│   ├── auth/
│   ├── events/
│   ├── observability/
│   ├── openapi/
│   ├── ai/
│   ├── cli/
│   └── testing/
├── apps/
│   └── example/
├── docs/
├── .agents/skills/
├── bun.lock
├── package.json
└── tsconfig.json
```

---

## 10. Common Commands

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 构建
bun run build

# 测试
bun test
bun test --coverage

# 类型检查
bun run typecheck

# 代码检查
bun run lint

# 数据库迁移
bun run migrate

# 生成 OpenAPI 文档
bun run openapi:generate

# 运行 CLI
bun run cli
```

---

## 11. Core Principles

1. Bun 优先。Bun 能解决的问题，不引入额外框架。
2. 函数式优先。避免 class、避免 DI、避免反射。
3. 显式依赖。依赖关系必须可读、可跳转、可测试。
4. 编译期安全优先于运行时魔法。
5. 默认安全。安全不是可选插件，而是默认姿态。
6. 默认可审计。关键决策、关键操作、关键失败都要留下可用证据。
7. 后端先行。全栈目标通过稳定后端契约向前演进，而不是前端抽象先行。
