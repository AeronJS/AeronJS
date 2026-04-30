# VentoStack 企业级平台能力 — 技术实施

> 基于架构分析文档，定义每个包的详细实施规范：数据库 Schema、Model 定义、Service 接口、路由契约、依赖注入方式、测试策略。

---

## 一、Phase 0 — 框架层安全修复与能力暴露

> 在启动平台包之前，必须先完成框架层的安全修复。这些改动是对已有包的最小增强。

### 0.1 Token 吊销持久化（`packages/auth/src/token-refresh.ts`）

**问题**：`revokedJTIs` 是内存 `Set<string>`，进程重启/多实例部署时丢失。

**方案**：抽取 `TokenRevocationStore` 接口，提供内存和 Redis 两种实现。

```typescript
// packages/auth/src/token-revocation-store.ts（新增文件）

interface TokenRevocationStore {
  add(jti: string, ttl: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}

// 内存实现（开发环境）
function createMemoryRevocationStore(): TokenRevocationStore

// Redis 实现（生产环境）
interface RedisRevocationClientLike {
  set(key: string, value: string, px: number): Promise<unknown>;
  exists(key: string): Promise<number>;
}
function createRedisRevocationStore(client: RedisRevocationClientLike, prefix?: string): TokenRevocationStore
```

**改造 `createTokenRefresh`**：

```typescript
// 增加 revocationStore 参数，默认使用内存实现（不破坏向后兼容）
function createTokenRefresh(
  jwt: JWTManager,
  options?: TokenRefreshOptions & { revocationStore?: TokenRevocationStore },
): TokenRefreshManager
```

### 0.2 Session Store 批量销毁（`packages/auth/src/session.ts`）

**问题**：缺少按 userId 批量销毁 Session 的能力。

**方案**：`SessionStore` 接口增加可选方法，`SessionManager` 增加按用户销毁。

```typescript
// SessionStore 增加可选方法
interface SessionStore {
  get(id: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  touch(id: string, ttl: number): Promise<void>;
  // 新增：按用户批量销毁（需要 Store 实现索引）
  deleteByUser?(userId: string): Promise<number>;
}

// SessionManager 增加
interface SessionManager {
  // ... 已有方法
  destroyByUser(userId: string): Promise<number>; // 新增
}
```

**Redis 实现**：Session 存储时额外维护 `session:user:{userId}` → `Set<sessionId>` 索引，`deleteByUser` 时批量删除。

### 0.3 统一踢人链路（`packages/auth/src/auth-session.ts` 新增）

**问题**：`multi-device.logoutAll()` 不联动 Token 吊销和 Session 销毁。

**方案**：新增聚合管理器，将三层操作原子联动。

```typescript
// packages/auth/src/auth-session.ts（新增文件）

interface AuthSessionManager {
  // 登录：创建 Session + 注册设备 + 签发 Token 对
  login(params: {
    userId: string;
    device: Omit<DeviceSession, "createdAt" | "lastActiveAt">;
    tokenPayload: Record<string, unknown>;
    sessionData?: Record<string, unknown>;
  }): Promise<{
    sessionId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;

  // 登出：销毁 Session + 移除设备 + 吊销 Refresh Token
  logout(userId: string, sessionId: string, refreshTokenJti?: string): Promise<void>;

  // 强制踢人：销毁该用户所有 Session + 所有设备 + 所有 Refresh Token
  forceLogout(userId: string): Promise<{ sessions: number; devices: number }>;

  // Refresh Token 轮换：验证旧 Token + 吊销 + 签发新 Token 对
  refreshTokens(refreshToken: string, secret: string): Promise<TokenPair>;
}

function createAuthSessionManager(deps: {
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  jwt: JWTManager;
}): AuthSessionManager
```

**`forceLogout` 实现逻辑**：

```
1. deviceManager.getSessions(userId) → 获取所有 sessionId
2. sessionManager.destroyByUser(userId) → 批量销毁 Session
3. deviceManager.logoutAll(userId) → 清空设备列表
4. Token 吊销：遍历 device sessions 中的 refreshTokenJti，逐个调用 tokenRefresh.revoke()
   （或维护 user → jti 索引做批量吊销）
```

### 0.4 TOTP 防重放（`packages/auth/src/totp.ts`）

**问题**：同一 TOTP code 在时间窗口内可重复使用。

**方案**：增加 `verifyAndConsume` 方法。

```typescript
interface TOTPManager {
  // ... 已有方法
  verifyAndConsume(secret: string, token: string, time?: number): Promise<boolean>;
  // 内部记录已消费的 (secret_hash, counter) 对，每个 counter 只允许消费一次
  // 存储在内存 Map 中，自动清理过期的 counter（超过 period * window 的记录）
}
```

### 0.5 JWT verify 增加 typ 校验（`packages/auth/src/jwt.ts`）

```typescript
// verify 方法增加 typ 检查
async verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload> {
  // 解码 header，检查 typ === "JWT"
  // 如果 header.typ 存在且 !== "JWT"，抛出错误
  // 如果 header.typ 不存在，允许通过（兼容旧 Token）
}
```

### 0.6 Tenant 校验 Hook（`packages/core/src/middlewares/tenant.ts`）

```typescript
interface TenantResolverOptions {
  // ... 已有字段
  // 新增：租户校验钩子
  validateTenant?: (tenantId: string, ctx: Context) => Promise<boolean>;
  // 返回 false 则拒绝请求（403）
}
```

### 0.7 Scheduler 执行 Hook（`packages/events/src/scheduler.ts`）

```typescript
interface ScheduleOptions {
  name: string;
  cron?: string;
  interval?: number;
  immediate?: boolean;
  // 新增执行钩子
  onBeforeExecute?: (task: { name: string; scheduledAt: number }) => Promise<void>;
  onAfterExecute?: (task: { name: string; duration: number }) => Promise<void>;
  onError?: (task: { name: string; error: Error; duration: number }) => Promise<void>;
}
```

### 0.8 暴露表结构读取 API（`packages/database/src/schema-reader.ts` 新增）

```typescript
// 从 schema-diff.ts 中抽取，独立导出
interface TableSchemaInfo {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: unknown;
    isPrimary: boolean;
    comment?: string;
  }>;
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
}

function readTableSchema(executor: SqlExecutor, tableName: string): Promise<TableSchemaInfo>
function listTables(executor: SqlExecutor): Promise<string[]>
```

### 0.9 Phase 0 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/auth/src/token-revocation-store.ts` | 新增 | TokenRevocationStore 接口 + 内存/Redis 实现 |
| `packages/auth/src/token-refresh.ts` | 修改 | 接受外部 revocationStore，默认兼容 |
| `packages/auth/src/session.ts` | 修改 | SessionStore 增加 deleteByUser 可选方法 |
| `packages/auth/src/redis-session-store.ts` | 修改 | 实现 deleteByUser + user→sessions 索引 |
| `packages/auth/src/auth-session.ts` | 新增 | 统一踢人链路 AuthSessionManager |
| `packages/auth/src/totp.ts` | 修改 | 增加 verifyAndConsume 防重放 |
| `packages/auth/src/jwt.ts` | 修改 | verify 增加 typ 头部校验 |
| `packages/auth/src/index.ts` | 修改 | 导出新增类型和函数 |
| `packages/core/src/middlewares/tenant.ts` | 修改 | 增加 validateTenant Hook |
| `packages/events/src/scheduler.ts` | 修改 | ScheduleOptions 增加执行 Hook |
| `packages/database/src/schema-reader.ts` | 新增 | readTableSchema / listTables |
| `packages/database/src/index.ts` | 修改 | 导出 schema-reader |

---

## 二、Phase 1 — `@ventostack/system` 实施规范

### 2.1 数据库 Schema

**所有表统一 `sys_` 前缀。迁移文件命名：`001_create_sys_tables.ts`。**

#### sys_user（用户表）

```sql
CREATE TABLE sys_user (
  id            VARCHAR(36)  PRIMARY KEY,          -- crypto.randomUUID()
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,              -- bcrypt hash
  nickname      VARCHAR(64),
  email         VARCHAR(128),
  phone         VARCHAR(20),
  avatar        VARCHAR(512),                       -- OSS file URL
  gender        SMALLINT     DEFAULT 0,             -- 0=未知 1=男 2=女
  status        SMALLINT     NOT NULL DEFAULT 1,    -- 0=禁用 1=正常
  dept_id       VARCHAR(36),
  mfa_enabled   BOOLEAN      DEFAULT FALSE,
  mfa_secret    VARCHAR(64),                        -- TOTP Base32 secret（加密存储）
  remark        VARCHAR(512),
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMP                           -- 软删除
);
CREATE INDEX idx_sys_user_dept ON sys_user(dept_id);
CREATE INDEX idx_sys_user_status ON sys_user(status);
```

#### sys_role（角色表）

```sql
CREATE TABLE sys_role (
  id          VARCHAR(36)  PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL,
  code        VARCHAR(64)  NOT NULL UNIQUE,         -- RBAC 引擎使用的 role key
  sort        INT          DEFAULT 0,
  data_scope  SMALLINT     DEFAULT 1,               -- 1=全部 2=本部门 3=本部门及以下 4=仅本人 5=自定义
  status      SMALLINT     NOT NULL DEFAULT 1,
  remark      VARCHAR(512),
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);
```

#### sys_user_role（用户-角色关联）

```sql
CREATE TABLE sys_user_role (
  user_id VARCHAR(36) NOT NULL,
  role_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (user_id, role_id)
);
```

#### sys_menu（菜单表）

```sql
CREATE TABLE sys_menu (
  id          VARCHAR(36)  PRIMARY KEY,
  parent_id   VARCHAR(36),                          -- NULL = 顶级
  name        VARCHAR(64)  NOT NULL,
  path        VARCHAR(256),                         -- 前端路由路径
  component   VARCHAR(256),                         -- 前端组件路径
  redirect    VARCHAR(256),
  type        SMALLINT     NOT NULL,                -- 1=目录 2=菜单 3=按钮
  permission  VARCHAR(128),                         -- 权限标识（如 system:user:list）
  icon        VARCHAR(128),
  sort        INT          DEFAULT 0,
  visible     BOOLEAN      DEFAULT TRUE,
  status      SMALLINT     NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_menu_parent ON sys_menu(parent_id);
```

#### sys_role_menu（角色-菜单关联）

```sql
CREATE TABLE sys_role_menu (
  role_id VARCHAR(36) NOT NULL,
  menu_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (role_id, menu_id)
);
```

#### sys_dept（部门表）

```sql
CREATE TABLE sys_dept (
  id          VARCHAR(36)  PRIMARY KEY,
  parent_id   VARCHAR(36),
  name        VARCHAR(64)  NOT NULL,
  sort        INT          DEFAULT 0,
  leader      VARCHAR(64),                          -- 负责人用户名
  phone       VARCHAR(20),
  email       VARCHAR(128),
  status      SMALLINT     NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);
CREATE INDEX idx_sys_dept_parent ON sys_dept(parent_id);
```

#### sys_post（岗位表）

```sql
CREATE TABLE sys_post (
  id          VARCHAR(36)  PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL,
  code        VARCHAR(64)  NOT NULL UNIQUE,
  sort        INT          DEFAULT 0,
  status      SMALLINT     NOT NULL DEFAULT 1,
  remark      VARCHAR(512),
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);
```

#### sys_user_post（用户-岗位关联）

```sql
CREATE TABLE sys_user_post (
  user_id VARCHAR(36) NOT NULL,
  post_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
```

#### sys_dict_type（字典类型表）

```sql
CREATE TABLE sys_dict_type (
  id          VARCHAR(36)  PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL,
  code        VARCHAR(64)  NOT NULL UNIQUE,
  status      SMALLINT     NOT NULL DEFAULT 1,
  remark      VARCHAR(512),
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

#### sys_dict_data（字典数据表）

```sql
CREATE TABLE sys_dict_data (
  id          VARCHAR(36)  PRIMARY KEY,
  type_code   VARCHAR(64)  NOT NULL,               -- 关联 sys_dict_type.code
  label       VARCHAR(128) NOT NULL,
  value       VARCHAR(128) NOT NULL,
  sort        INT          DEFAULT 0,
  css_class   VARCHAR(128),                        -- 前端样式
  status      SMALLINT     NOT NULL DEFAULT 1,
  remark      VARCHAR(512),
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_dict_data_type ON sys_dict_data(type_code);
```

#### sys_config（系统参数表）

```sql
CREATE TABLE sys_config (
  id          VARCHAR(36)  PRIMARY KEY,
  name        VARCHAR(128) NOT NULL,
  key         VARCHAR(128) NOT NULL UNIQUE,
  value       TEXT         NOT NULL,
  type        SMALLINT     DEFAULT 0,               -- 0=字符串 1=数字 2=布尔 3=JSON
  group       VARCHAR(64),                          -- 分组
  remark      VARCHAR(512),
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

#### sys_notice（通知公告表）

```sql
CREATE TABLE sys_notice (
  id            VARCHAR(36)  PRIMARY KEY,
  title         VARCHAR(256) NOT NULL,
  content       TEXT         NOT NULL,
  type          SMALLINT     NOT NULL DEFAULT 1,    -- 1=通知 2=公告
  status        SMALLINT     NOT NULL DEFAULT 0,    -- 0=草稿 1=已发布 2=已撤回
  publisher_id  VARCHAR(36),
  publish_at    TIMESTAMP,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMP
);
```

#### sys_user_notice（用户-公告已读表）

```sql
CREATE TABLE sys_user_notice (
  user_id    VARCHAR(36) NOT NULL,
  notice_id  VARCHAR(36) NOT NULL,
  read_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notice_id)
);
```

#### sys_login_log（登录日志表）

```sql
CREATE TABLE sys_login_log (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36),
  username    VARCHAR(64)  NOT NULL,
  ip          VARCHAR(64),
  location    VARCHAR(128),                        -- IP 地理位置
  browser     VARCHAR(128),
  os          VARCHAR(128),
  status      SMALLINT     NOT NULL,                -- 0=失败 1=成功
  message     VARCHAR(512),                        -- 失败原因
  login_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_login_log_user ON sys_login_log(user_id);
CREATE INDEX idx_sys_login_log_time ON sys_login_log(login_at);
```

#### sys_operation_log（操作日志表）

```sql
CREATE TABLE sys_operation_log (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36),
  username    VARCHAR(64),
  module      VARCHAR(64),                          -- 模块名
  action      VARCHAR(64),                          -- 操作名
  method      VARCHAR(10),                          -- HTTP method
  url         VARCHAR(512),
  ip          VARCHAR(64),
  params      TEXT,                                 -- 请求参数（脱敏后）
  result      SMALLINT,                             -- 0=失败 1=成功
  error_msg   TEXT,
  duration    INT,                                  -- 耗时 ms
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_oplog_user ON sys_operation_log(user_id);
CREATE INDEX idx_sys_oplog_time ON sys_operation_log(created_at);
```

#### sys_mfa_recovery（MFA 恢复码表）

```sql
CREATE TABLE sys_mfa_recovery (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  code_hash   VARCHAR(128) NOT NULL,                -- SHA-256(recovery_code)
  used_at     TIMESTAMP,                            -- 使用时间
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_mfa_recovery_user ON sys_mfa_recovery(user_id);
```

### 2.2 Model 定义

每个 Model 使用 `defineModel()` 定义，放在 `packages/platform/system/src/models/` 下。

```typescript
// models/user.ts
import { defineModel, column } from '@ventostack/database';

export const UserModel = defineModel('sys_user', {
  id:            column.varchar({ primary: true, length: 36 }),
  username:      column.varchar({ length: 64 }),
  passwordHash:  column.varchar({ length: 128, comment: 'bcrypt hash' }),
  nickname:      column.varchar({ length: 64, nullable: true }),
  email:         column.varchar({ length: 128, nullable: true }),
  phone:         column.varchar({ length: 20, nullable: true }),
  avatar:        column.varchar({ length: 512, nullable: true }),
  gender:        column.int({ nullable: true, default: 0, comment: '0=未知 1=男 2=女' }),
  status:        column.int({ default: 1, comment: '0=禁用 1=正常' }),
  deptId:        column.varchar({ length: 36, nullable: true }),
  mfaEnabled:    column.boolean({ default: false }),
  mfaSecret:     column.varchar({ length: 64, nullable: true, comment: 'TOTP Base32 encrypted' }),
  remark:        column.varchar({ length: 512, nullable: true }),
}, {
  softDelete: true,
  timestamps: true,
});
```

```typescript
// models/role.ts
export const RoleModel = defineModel('sys_role', {
  id:         column.varchar({ primary: true, length: 36 }),
  name:       column.varchar({ length: 64 }),
  code:       column.varchar({ length: 64, unique: true, comment: 'RBAC role key' }),
  sort:       column.int({ default: 0 }),
  dataScope:  column.int({ default: 1, comment: '1=全部 2=本部门 3=本部门及以下 4=仅本人 5=自定义' }),
  status:     column.int({ default: 1 }),
  remark:     column.varchar({ length: 512, nullable: true }),
}, { softDelete: true, timestamps: true });

export const UserRoleModel = defineModel('sys_user_role', {
  userId: column.varchar({ length: 36 }),
  roleId: column.varchar({ length: 36 }),
});
```

```typescript
// models/menu.ts
export const MenuModel = defineModel('sys_menu', {
  id:         column.varchar({ primary: true, length: 36 }),
  parentId:   column.varchar({ length: 36, nullable: true }),
  name:       column.varchar({ length: 64 }),
  path:       column.varchar({ length: 256, nullable: true }),
  component:  column.varchar({ length: 256, nullable: true }),
  redirect:   column.varchar({ length: 256, nullable: true }),
  type:       column.int({ comment: '1=目录 2=菜单 3=按钮' }),
  permission: column.varchar({ length: 128, nullable: true }),
  icon:       column.varchar({ length: 128, nullable: true }),
  sort:       column.int({ default: 0 }),
  visible:    column.boolean({ default: true }),
  status:     column.int({ default: 1 }),
}, { timestamps: true });

export const RoleMenuModel = defineModel('sys_role_menu', {
  roleId: column.varchar({ length: 36 }),
  menuId: column.varchar({ length: 36 }),
});
```

其余 Model（`DeptModel`, `PostModel`, `UserPostModel`, `DictTypeModel`, `DictDataModel`, `ConfigModel`, `NoticeModel`, `UserNoticeModel`, `LoginLogModel`, `OperationLogModel`, `MfaRecoveryModel`）按同样模式定义。

### 2.3 Service 接口

#### AuthService（登录/注册/MFA/踢人）

```typescript
// services/auth.ts

interface LoginParams {
  username: string;
  password: string;
  ip: string;
  userAgent: string;
  deviceType?: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
  mfaRequired: boolean;
}

interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  phone?: string;
}

interface MFASetupResult {
  secret: string;
  qrCodeUri: string;       // otpauth:// URI
  recoveryCodes: string[];  // 8 个恢复码
}

interface AuthService {
  login(params: LoginParams): Promise<LoginResult>;
  logout(userId: string, sessionId: string, refreshTokenJti?: string): Promise<void>;
  refreshToken(oldRefreshToken: string): Promise<TokenPair>;
  register(params: RegisterParams): Promise<{ userId: string }>;
  forgotPassword(email: string): Promise<void>;             // 发送重置链接
  resetPassword(token: string, newPassword: string): Promise<void>;
  forceLogout(userId: string): Promise<{ sessions: number; devices: number }>;

  // MFA
  enableMFA(userId: string): Promise<MFASetupResult>;
  verifyMFA(userId: string, code: string): Promise<boolean>;
  disableMFA(userId: string, code: string): Promise<void>;
  recoverMFA(userId: string, recoveryCode: string): Promise<{ accessToken: string }>;
}

function createAuthService(deps: {
  db: Database;
  cache: Cache;
  authSessionManager: AuthSessionManager;
  jwt: JWTManager;
  passwordHasher: PasswordHasher;
  totp: TOTPManager;
  auditLog: AuditStore;
  eventBus: EventBus;
}): AuthService
```

**登录流程**：

```
1. 按 IP + username 查询限流计数器（cache.get(`login_fail:${ip}:${username}`)）
   - 超过 5 次则拒绝并返回"账户已锁定"
2. 查询 sys_user WHERE username = ? AND deleted_at IS NULL
3. 校验 status === 1（账户正常）
4. passwordHasher.verify(password, user.passwordHash)
5. 若失败：INCR 限流计数器（TTL 30min），记录登录日志（status=0），抛出 ClientError
6. 若成功：清除限流计数器
7. 若 user.mfaEnabled：
   - 签发临时 MFA Token（TTL 5min），返回 { mfaRequired: true, accessToken: mfaToken }
   - 前端调用 /api/auth/mfa/verify 提交 TOTP code
8. 若不需要 MFA：
   - authSessionManager.login() 创建完整会话
   - 记录登录日志（status=1）
   - 发送 user.login 事件
   - 返回 Token 对
```

**限流 Key 设计**：

```
login_fail:{ip}:{username}    → 失败次数（TTL 30min，max 5）
login_ip:{ip}                 → 单 IP 总请求频率（每分钟 20 次）
mfa_verify:{userId}           → MFA 验证频率（每分钟 5 次）
```

#### UserService

```typescript
interface CreateUserParams {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  phone?: string;
  deptId?: string;
  postIds?: string[];
  roleIds?: string[];
  status?: number;
  remark?: string;
}

interface UpdateUserParams {
  nickname?: string;
  email?: string;
  phone?: string;
  deptId?: string;
  postIds?: string[];
  roleIds?: string[];
  status?: number;
  remark?: string;
  avatar?: string;
}

interface UserListParams {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: number;
  deptId?: string;
}

interface UserService {
  create(params: CreateUserParams): Promise<{ id: string }>;
  update(id: string, params: UpdateUserParams): Promise<void>;
  delete(id: string): Promise<void>;                    // 软删除
  getById(id: string): Promise<UserDetail | null>;
  list(params: UserListParams): Promise<PaginatedData<UserListItem>>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  updateStatus(id: string, status: number): Promise<void>;
  export(params: Omit<UserListParams, 'page' | 'pageSize'>): Promise<Buffer>; // CSV/Excel
}

interface UserDetail {
  id: string; username: string; nickname: string; email: string; phone: string;
  avatar: string; gender: number; status: number; deptId: string; deptName?: string;
  roles: Array<{ id: string; name: string; code: string }>;
  posts: Array<{ id: string; name: string; code: string }>;
  mfaEnabled: boolean; createdAt: string; updatedAt: string;
}

function createUserService(deps: { db: Database; cache: Cache; passwordHasher: PasswordHasher }): UserService
```

#### RoleService

```typescript
interface RoleService {
  create(params: { name: string; code: string; sort?: number; dataScope?: number; remark?: string }): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateRoleParams>): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<RoleDetail | null>;
  list(params?: { page?: number; pageSize?: number; status?: number }): Promise<PaginatedData<RoleListItem>>;
  assignMenus(roleId: string, menuIds: string[]): Promise<void>;
  assignDataScope(roleId: string, scope: number, deptIds?: string[]): Promise<void>;
}
```

#### MenuService

```typescript
interface MenuTreeNode {
  id: string; parentId: string | null; name: string; path: string;
  component: string; redirect: string; type: number; permission: string;
  icon: string; sort: number; visible: boolean; status: number;
  children: MenuTreeNode[];
}

interface MenuService {
  create(params: CreateMenuParams): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateMenuParams>): Promise<void>;
  delete(id: string): Promise<void>;
  getTree(): Promise<MenuTreeNode[]>;
  getById(id: string): Promise<MenuTreeNode | null>;
}
```

#### DictService

```typescript
interface DictService {
  createType(params: { name: string; code: string; remark?: string }): Promise<{ id: string }>;
  updateType(code: string, params: Partial<CreateDictTypeParams>): Promise<void>;
  deleteType(code: string): Promise<void>;
  listTypes(params?: { page?: number; pageSize?: number }): Promise<PaginatedData<DictTypeItem>>;

  createData(params: { typeCode: string; label: string; value: string; sort?: number; cssClass?: string }): Promise<{ id: string }>;
  updateData(id: string, params: Partial<CreateDictDataParams>): Promise<void>;
  deleteData(id: string): Promise<void>;
  listDataByType(typeCode: string): Promise<DictDataItem[]>;       // 走缓存
  refreshCache(typeCode?: string): Promise<void>;                   // 手动刷新
}
```

#### ConfigService

```typescript
interface ConfigService {
  create(params: { name: string; key: string; value: string; type?: number; group?: string; remark?: string }): Promise<{ id: string }>;
  update(key: string, params: Partial<CreateConfigParams>): Promise<void>;
  delete(key: string): Promise<void>;
  list(params?: { page?: number; pageSize?: number; group?: string }): Promise<PaginatedData<ConfigItem>>;
  getValue(key: string): Promise<string | null>;                     // 走缓存
  refreshCache(key?: string): Promise<void>;
}
```

#### NoticeService

```typescript
interface NoticeService {
  create(params: { title: string; content: string; type: number }): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateNoticeParams>): Promise<void>;
  delete(id: string): Promise<void>;
  list(params?: { page?: number; pageSize?: number; type?: number; status?: number }): Promise<PaginatedData<NoticeItem>>;
  publish(id: string, publisherId: string): Promise<void>;
  revoke(id: string): Promise<void>;
  markRead(userId: string, noticeId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
}
```

#### PermissionLoader（DB → RBAC 引擎）

```typescript
interface PermissionLoader {
  loadAll(): Promise<void>;          // 启动时调用，从 DB 加载所有角色-权限到 RBAC 引擎
  reloadRole(roleCode: string): Promise<void>;  // 角色变更时热更新
  reloadAll(): Promise<void>;        // 全量重载
}

function createPermissionLoader(deps: {
  db: Database;
  rbac: RBAC;
  policyEngine: PolicyEngine;
  rowFilter: RowFilter;
}): PermissionLoader
```

**加载逻辑**：

```typescript
async loadAll() {
  // 1. 加载角色
  const roles = await db.query(RoleModel).where('status', '=', 1).select();
  for (const role of roles) {
    rbac.addRole({ name: role.code, permissions: [] });
  }

  // 2. 加载角色-菜单权限
  for (const role of roles) {
    const menus = await db.query(`
      SELECT m.permission FROM sys_role_menu rm
      JOIN sys_menu m ON rm.menu_id = m.id
      WHERE rm.role_id = ? AND m.permission IS NOT NULL AND m.type = 3
    `, [role.id]);

    for (const menu of menus) {
      if (menu.permission) {
        const [resource, action] = parsePermission(menu.permission);
        rbac.grantPermission(role.code, resource, action);
      }
    }
  }

  // 3. 加载数据权限规则
  for (const role of roles) {
    if (role.dataScope !== 1) { // 非全部数据权限
      rowFilter.addRule({
        resource: '*',
        field: 'dept_id',
        operator: role.dataScope === 4 ? 'eq' : 'in',
        valueFrom: 'user',
        value: role.dataScope === 4 ? 'deptId' : 'deptAndChildrenIds',
      });
    }
  }
}
```

#### MenuTreeBuilder（DB → 前端路由树）

```typescript
interface MenuTreeBuilder {
  buildRoutesForUser(userId: string): Promise<FrontendRoute[]>;
  buildPermissionsForUser(userId: string): Promise<string[]>;
}

interface FrontendRoute {
  name: string;
  path: string;
  component?: string;
  redirect?: string;
  meta: {
    title: string;
    icon?: string;
    hidden?: boolean;
    permissions?: string[];
  };
  children?: FrontendRoute[];
}

function createMenuTreeBuilder(deps: { db: Database }): MenuTreeBuilder
```

### 2.4 路由契约

所有路由使用 `createRouter()` 定义，按领域分组。

```typescript
// routes/auth.ts — 公开端点（有独立限流）
export function createAuthRoutes(authService: AuthService): Router {
  const router = createRouter();

  // 登录限流：每 IP 每分钟 20 次
  const loginLimiter = rateLimit({ windowMs: 60_000, max: 20, keyFn: (ctx) => ctx.ip });
  // 登录失败限流：每 IP+username 每 30 分钟 5 次（在 authService 内部实现）

  router.post('/api/auth/login', loginLimiter, async (ctx) => { ... });
  router.post('/api/auth/logout', authRequired, async (ctx) => { ... });
  router.post('/api/auth/refresh', async (ctx) => { ... });
  router.post('/api/auth/register', rateLimit({ windowMs: 3600_000, max: 5, keyFn: (ctx) => ctx.ip }), async (ctx) => { ... });
  router.post('/api/auth/forgot-password', rateLimit({ windowMs: 60_000, max: 3, keyFn: (ctx) => ctx.ip }), async (ctx) => { ... });
  router.post('/api/auth/reset-password', async (ctx) => { ... });

  // MFA（独立限流）
  const mfaLimiter = rateLimit({ windowMs: 60_000, max: 5, keyFn: (ctx) => ctx.user.id });
  router.post('/api/auth/mfa/enable', authRequired, mfaLimiter, async (ctx) => { ... });
  router.post('/api/auth/mfa/verify', authRequired, mfaLimiter, async (ctx) => { ... });
  router.post('/api/auth/mfa/disable', authRequired, mfaLimiter, async (ctx) => { ... });
  router.post('/api/auth/mfa/recover', mfaLimiter, async (ctx) => { ... });

  return router;
}
```

```typescript
// routes/user.ts — 需认证 + 权限
export function createUserRoutes(userService: UserService): Router {
  const router = createRouter();

  router.get('/api/system/users', authRequired, permRequired('system:user:list'), async (ctx) => { ... });
  router.get('/api/system/users/:id', authRequired, permRequired('system:user:query'), async (ctx) => { ... });
  router.post('/api/system/users', authRequired, permRequired('system:user:create'), async (ctx) => { ... });
  router.put('/api/system/users/:id', authRequired, permRequired('system:user:update'), async (ctx) => { ... });
  router.delete('/api/system/users/:id', authRequired, permRequired('system:user:delete'), async (ctx) => { ... });
  router.put('/api/system/users/:id/reset-pwd', authRequired, permRequired('system:user:resetPwd'), async (ctx) => { ... });
  router.put('/api/system/users/:id/status', authRequired, permRequired('system:user:update'), async (ctx) => { ... });
  router.post('/api/system/users/export', authRequired, permRequired('system:user:export'), async (ctx) => { ... });

  return router;
}
```

```typescript
// routes/user-routes.ts — 当前用户的菜单/权限
export function createUserSelfRoutes(menuTreeBuilder: MenuTreeBuilder): Router {
  const router = createRouter();

  router.get('/api/system/user/routes', authRequired, async (ctx) => {
    const routes = await menuTreeBuilder.buildRoutesForUser(ctx.user.id);
    return Response.json({ data: routes });
  });

  router.get('/api/system/user/permissions', authRequired, async (ctx) => {
    const perms = await menuTreeBuilder.buildPermissionsForUser(ctx.user.id);
    return Response.json({ data: perms });
  });

  return router;
}
```

其余路由文件（`role.ts`, `menu.ts`, `dept.ts`, `post.ts`, `dict.ts`, `config.ts`, `notice.ts`, `log.ts`）遵循相同模式。

### 2.5 中间件

#### 操作日志中间件

```typescript
// middlewares/operation-log.ts

interface OperationLogOptions {
  excludePaths?: string[];    // 排除的路径
  sensitiveFields?: string[]; // 脱敏字段
}

function createOperationLogMiddleware(
  auditLog: AuditStore,
  options?: OperationLogOptions,
): Middleware
```

**实现逻辑**：

```
1. 跳过 GET / HEAD / OPTIONS 请求（只记录变更操作）
2. 从 ctx 读取 user / method / url / ip / body
3. 脱敏 body 中的敏感字段（password, token, secret 等）
4. 执行 next()
5. 记录结果（成功/失败）和耗时
6. 异步写入 sys_operation_log（不阻塞响应）
```

#### 认证/权限守卫

```typescript
// middlewares/auth-guard.ts

// 已认证检查
const authRequired: Middleware = async (ctx, next) => {
  const token = extractBearerToken(ctx.request);
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = await jwt.verify(token);
  ctx.user = { id: payload.sub, roles: payload.roles, tenantId: payload.tenantId };
  return next();
};

// 权限检查（基于 RBAC）
function permRequired(resource: string, action: string): Middleware {
  return (ctx, next) => {
    const allowed = ctx.user.roles.some(role => rbac.hasPermission(role, resource, action));
    if (!allowed) throw new ForbiddenError(`No permission: ${resource}:${action}`);
    return next();
  };
}
```

### 2.6 Module 聚合

```typescript
// module.ts

interface SystemModule {
  routes: Router;
  services: {
    auth: AuthService;
    user: UserService;
    role: RoleService;
    menu: MenuService;
    dept: DeptService;
    post: PostService;
    dict: DictService;
    config: ConfigService;
    notice: NoticeService;
    permissionLoader: PermissionLoader;
    menuTreeBuilder: MenuTreeBuilder;
  };
}

function createSystemModule(deps: {
  db: Database;
  cache: Cache;
  jwt: JWTManager;
  passwordHasher: PasswordHasher;
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  authSessionManager: AuthSessionManager;
  totp: TOTPManager;
  rbac: RBAC;
  policyEngine: PolicyEngine;
  rowFilter: RowFilter;
  auditLog: AuditStore;
  eventBus: EventBus;
}): SystemModule
```

**聚合逻辑**：

```typescript
function createSystemModule(deps) {
  // 创建所有 Service
  const authService = createAuthService({ ... });
  const userService = createUserService({ ... });
  const roleService = createRoleService({ ... });
  // ...

  // 创建权限加载器和菜单树构建器
  const permissionLoader = createPermissionLoader({ ... });
  const menuTreeBuilder = createMenuTreeBuilder({ ... });

  // 合并所有路由
  const router = createRouter();
  router.use(createAuthRoutes(authService));
  router.use(createUserRoutes(userService));
  router.use(createRoleRoutes(roleService));
  // ... 其余路由

  return { routes: router, services: { auth: authService, user: userService, ... } };
}
```

### 2.7 Seed 数据

```typescript
// seeds/001_init_admin.ts

export const adminSeed = {
  // 管理员用户（密码：admin123）
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'admin',
    passwordHash: await Bun.password.hash('admin123', { algorithm: 'bcrypt', cost: 12 }),
    nickname: '超级管理员',
    status: 1,
  },
  // 管理员角色
  role: {
    id: '00000000-0000-0000-0000-000000000001',
    name: '超级管理员',
    code: 'admin',
    dataScope: 1,
    status: 1,
  },
  // 基础菜单（系统管理）
  menus: [
    { id: 'sys', parentId: null, name: '系统管理', path: '/system', type: 1, icon: 'setting', sort: 1 },
    { id: 'sys:user', parentId: 'sys', name: '用户管理', path: '/system/user', component: 'system/user/index', type: 2, permission: null, sort: 1 },
    { id: 'sys:user:list', parentId: 'sys:user', name: '用户查询', type: 3, permission: 'system:user:list' },
    { id: 'sys:user:create', parentId: 'sys:user', name: '用户新增', type: 3, permission: 'system:user:create' },
    { id: 'sys:user:update', parentId: 'sys:user', name: '用户修改', type: 3, permission: 'system:user:update' },
    { id: 'sys:user:delete', parentId: 'sys:user', name: '用户删除', type: 3, permission: 'system:user:delete' },
    { id: 'sys:user:resetPwd', parentId: 'sys:user', name: '重置密码', type: 3, permission: 'system:user:resetPwd' },
    { id: 'sys:user:export', parentId: 'sys:user', name: '导出', type: 3, permission: 'system:user:export' },
    // ... role, menu, dept, post, dict, config, notice 菜单
  ],
};
```

### 2.8 测试策略

| 测试类型 | 文件位置 | 说明 |
|---------|---------|------|
| Model 单元测试 | `tests/models/*.test.ts` | 验证 defineModel 的列定义和选项 |
| Service 单元测试 | `tests/services/*.test.ts` | Mock db/cache/auth，验证业务逻辑 |
| 路由集成测试 | `tests/routes/*.test.ts` | 使用 TestClient 发送 HTTP 请求 |
| 安全回归测试 | `tests/security/*.test.ts` | 暴力破解、越权、注入、踢人、MFA 重放 |
| 迁移测试 | `tests/migrations/*.test.ts` | 验证迁移可执行、可回滚 |

**安全回归测试清单**：

```typescript
// tests/security/auth.test.ts

describe('Auth Security', () => {
  test('连续 5 次登录失败后账户锁定');
  test('不同 IP 的失败不互相影响');
  test('成功登录后清除失败计数');
  test('Refresh Token 轮换后旧 Token 失效');
  test('强制踢人后所有 Token 和 Session 失效');
  test('TOTP code 不能在同一时间窗口重复使用');
  test('恢复码只能使用一次');
  test('无权限用户访问受保护端点返回 403');
  test('SQL 注入 payload 在 username 中被正确处理');
  test('XSS payload 在 nickname 中被转义');
  test('JWT 过期后请求被拒绝');
});
```

---

## 三、Phase 2 — `@ventostack/oss` 实施规范

### 3.1 数据库 Schema

```sql
CREATE TABLE sys_oss_file (
  id             VARCHAR(36)  PRIMARY KEY,
  original_name  VARCHAR(256) NOT NULL,
  storage_path   VARCHAR(512) NOT NULL,
  size           BIGINT       NOT NULL,
  mime_type      VARCHAR(128),
  extension      VARCHAR(16),
  bucket         VARCHAR(64)  DEFAULT 'default',
  uploader_id    VARCHAR(36),
  ref_count      INT          DEFAULT 0,
  metadata       JSON,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_oss_uploader ON sys_oss_file(uploader_id);
```

### 3.2 存储适配器接口

```typescript
// adapters/storage.ts

interface StorageAdapter {
  write(key: string, data: Buffer | ReadableStream, contentType?: string): Promise<void>;
  read(key: string): Promise<ReadableStream | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

function createLocalStorage(options: { rootDir: string; baseUrl?: string }): StorageAdapter
function createS3Storage(options: { endpoint: string; bucket: string; accessKey: string; secretKey: string; region?: string }): StorageAdapter
```

### 3.3 OSS Service

```typescript
interface UploadParams {
  file: File;
  bucket?: string;
  path?: string;      // 自定义存储路径
  allowedTypes?: string[];
  maxSize?: number;
}

interface OSSService {
  upload(params: UploadParams, uploaderId: string): Promise<OSSFileRecord>;
  download(fileId: string): Promise<{ stream: ReadableStream; contentType: string; filename: string }>;
  delete(fileId: string): Promise<void>;
  getSignedUrl(fileId: string, expiresIn?: number): Promise<string>;
  list(params: { bucket?: string; uploaderId?: string; page?: number; pageSize?: number }): Promise<PaginatedData<OSSFileRecord>>;
}
```

### 3.4 Magic-Byte 校验

```typescript
// services/mime-detect.ts

// 基于文件头 magic bytes 校验真实 MIME 类型
const MAGIC_BYTES: Record<string, { bytes: number[]; mime: string }> = {
  PNG:  { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  JPEG: { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  GIF:  { bytes: [0x47, 0x49, 0x46], mime: 'image/gif' },
  PDF:  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  // ...
};

function detectMIME(buffer: Buffer): string | null
```

---

## 四、Phase 2 — `@ventostack/scheduler` 实施规范

### 4.1 数据库 Schema

```sql
CREATE TABLE sys_schedule_job (
  id           VARCHAR(36)  PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  handler_id   VARCHAR(128) NOT NULL,        -- 处理器标识（注册到 Scheduler 的名称）
  cron         VARCHAR(64),                  -- Cron 表达式
  params       JSON,                          -- 传递给 handler 的参数
  status       SMALLINT     DEFAULT 0,       -- 0=暂停 1=运行
  description  VARCHAR(512),
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE sys_schedule_job_log (
  id          VARCHAR(36)  PRIMARY KEY,
  job_id      VARCHAR(36)  NOT NULL,
  start_at    TIMESTAMP    NOT NULL,
  end_at      TIMESTAMP,
  status      SMALLINT     NOT NULL,          -- 0=失败 1=成功 2=运行中
  result      TEXT,
  error       TEXT,
  duration_ms INT,
  CONSTRAINT fk_job FOREIGN KEY (job_id) REFERENCES sys_schedule_job(id)
);
CREATE INDEX idx_sys_job_log_job ON sys_schedule_job_log(job_id);
CREATE INDEX idx_sys_job_log_time ON sys_schedule_job_log(start_at);
```

### 4.2 Scheduler Service

```typescript
interface SchedulerService {
  createJob(params: { name: string; handlerId: string; cron: string; params?: Record<string, unknown> }): Promise<{ id: string }>;
  updateJob(id: string, params: Partial<CreateJobParams>): Promise<void>;
  deleteJob(id: string): Promise<void>;
  startJob(id: string): Promise<void>;
  stopJob(id: string): Promise<void>;
  executeNow(id: string): Promise<void>;
  listJobs(params?: { page?: number; pageSize?: number; status?: number }): Promise<PaginatedData<JobItem>>;
  getLogs(params: { jobId?: string; status?: number; page?: number; pageSize?: number }): Promise<PaginatedData<JobLogItem>>;
}

function createSchedulerModule(deps: {
  db: Database;
  baseScheduler: Scheduler;
  eventBus: EventBus;
  auditLog: AuditStore;
}): SchedulerService
```

**对接 Scheduler Hook**：

```typescript
// 注册全局执行钩子
baseScheduler.schedule({
  name: job.handlerId,
  cron: job.cron,
  onBeforeExecute: async (task) => {
    await db.insert(JobLogModel, { id: uuid(), jobId: job.id, startAt: new Date(), status: 2 });
  },
  onAfterExecute: async (task) => {
    await db.update(JobLogModel).where('jobId', '=', job.id).where('status', '=', 2)
      .set({ endAt: new Date(), status: 1, durationMs: task.duration });
  },
  onError: async (task) => {
    await db.update(JobLogModel).where('jobId', '=', job.id).where('status', '=', 2)
      .set({ endAt: new Date(), status: 0, error: task.error.message, durationMs: task.duration });
    await eventBus.emit(JobFailedEvent, { jobId: job.id, error: task.error.message });
  },
}, handler);
```

---

## 五、Phase 3 — `@ventostack/gen` 实施规范

### 5.1 数据库 Schema

```sql
CREATE TABLE sys_gen_table (
  id             VARCHAR(36)  PRIMARY KEY,
  table_name     VARCHAR(128) NOT NULL,
  table_comment  VARCHAR(512),
  module_name    VARCHAR(64)  NOT NULL,
  business_name  VARCHAR(64)  NOT NULL,
  gen_type       SMALLINT     DEFAULT 0,     -- 0=单表 1=树表 2=主子表
  package_path   VARCHAR(256),
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE sys_gen_table_column (
  id             VARCHAR(36)  PRIMARY KEY,
  table_id       VARCHAR(36)  NOT NULL,
  column_name    VARCHAR(128) NOT NULL,
  column_type    VARCHAR(64),
  column_comment VARCHAR(512),
  ts_type        VARCHAR(32),
  display_type   VARCHAR(32),               -- input/select/date/textarea/...
  query_type     VARCHAR(32),               -- eq/like/between/in/...
  is_required    BOOLEAN DEFAULT FALSE,
  is_list        BOOLEAN DEFAULT TRUE,       -- 是否在列表显示
  is_query       BOOLEAN DEFAULT FALSE,     -- 是否作为查询条件
  is_insert      BOOLEAN DEFAULT TRUE,
  is_edit        BOOLEAN DEFAULT TRUE,
  sort           INT DEFAULT 0,
  CONSTRAINT fk_gen_table FOREIGN KEY (table_id) REFERENCES sys_gen_table(id)
);
```

### 5.2 Gen Service

```typescript
interface GenService {
  importTable(tableName: string): Promise<{ tableId: string }>;
  updateTableConfig(tableId: string, params: Partial<GenTableConfig>): Promise<void>;
  updateColumnConfig(columnId: string, params: Partial<GenColumnConfig>): Promise<void>;
  generate(tableId: string): Promise<GenResult>;
  preview(tableId: string): Promise<Record<string, string>>;  // 文件名 → 代码内容
}

interface GenResult {
  files: Array<{ path: string; content: string }>;
}

function createGenService(deps: {
  db: Database;
}): GenService
```

### 5.3 CLI 扩展

```typescript
// cli-plugin.ts

export function registerGenCommand(cli: CLI, genService: GenService): void {
  cli.command('gen', '代码生成工具')
    .command('import <table>', '导入数据库表', async (opts) => {
      const result = await genService.importTable(opts.table);
      console.log(`Imported table: ${result.tableId}`);
    })
    .command('generate <tableId>', '生成代码', async (opts) => {
      const result = await genService.generate(opts.tableId);
      for (const file of result.files) {
        await Bun.write(file.path, file.content);
        console.log(`Generated: ${file.path}`);
      }
    })
    .command('preview <tableId>', '预览生成代码', async (opts) => {
      const files = await genService.preview(opts.tableId);
      for (const [name, content] of Object.entries(files)) {
        console.log(`--- ${name} ---`);
        console.log(content);
      }
    });
}
```

### 5.4 代码模板

模板使用 Bun 原生字符串模板，不引入第三方模板引擎。

```
templates/
├── model.ts.tmpl         # defineModel 生成模板
├── service.ts.tmpl       # Service 生成模板
├── routes.ts.tmpl        # REST API 路由模板
├── types.ts.tmpl         # TypeScript 类型导出
└── test.ts.tmpl          # 测试文件模板
```

---

## 六、Phase 3 — `@ventostack/monitor` 实施规范

### 6.1 无数据库表

纯聚合 API，数据来自运行时状态。

### 6.2 Monitor Service

```typescript
interface MonitorService {
  // 在线用户
  getOnlineUsers(params?: { page?: number; pageSize?: number }): Promise<PaginatedData<OnlineUser>>;
  forceLogout(userId: string): Promise<void>;

  // 服务器状态
  getServerStatus(): Promise<ServerStatus>;

  // 缓存监控
  getCacheStats(): Promise<CacheStats>;

  // 数据源监控
  getDataSourceStatus(): Promise<DataSourceStatus>;

  // 健康检查聚合
  getHealthStatus(): Promise<HealthStatus>;
}

interface ServerStatus {
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  bunVersion: string;
  cpuUsage: number;          // process.cpuUsage
  memoryUsage: {             // process.memoryUsage
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  uptime: number;
  diskUsage?: { total: number; used: number; free: number };
}

interface CacheStats {
  keys: number;
  hitRate: number;
  memoryUsage: number;
  keyspace: Record<string, { keys: number; expires: number }>;
}

interface OnlineUser {
  userId: string;
  username: string;
  sessionId: string;
  deviceType: string;
  ip: string;
  loginAt: number;
  lastActiveAt: number;
}
```

---

## 七、Phase 3 — `@ventostack/notification` 实施规范

### 7.1 数据库 Schema

```sql
CREATE TABLE sys_notify_template (
  id               VARCHAR(36)  PRIMARY KEY,
  name             VARCHAR(128) NOT NULL,
  channel          VARCHAR(16)  NOT NULL,     -- email / sms / webhook
  title_template   VARCHAR(256),
  content_template TEXT         NOT NULL,
  variables        JSON,                      -- 变量定义 [{ name, type, required }]
  status           SMALLINT     DEFAULT 1,
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE sys_notify_message (
  id           VARCHAR(36)  PRIMARY KEY,
  template_id  VARCHAR(36),
  receiver_id  VARCHAR(36)  NOT NULL,
  channel      VARCHAR(16)  NOT NULL,
  title        VARCHAR(256),
  content      TEXT         NOT NULL,
  status       SMALLINT     DEFAULT 0,       -- 0=待发送 1=已发送 2=发送失败
  sent_at      TIMESTAMP,
  error        TEXT,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sys_notify_receiver ON sys_notify_message(receiver_id);

CREATE TABLE sys_notify_user_read (
  user_id     VARCHAR(36) NOT NULL,
  message_id  VARCHAR(36) NOT NULL,
  read_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);
```

### 7.2 渠道适配器

```typescript
interface NotifyChannel {
  name: string;
  send(params: { to: string; title: string; content: string }): Promise<{ success: boolean; error?: string }>;
}

function createSMTPChannel(options: { host: string; port: number; user: string; pass: string; from: string }): NotifyChannel
function createSMSChannel(options: { provider: string; apiKey: string; signName: string }): NotifyChannel
function createWebhookChannel(options: { url: string; secret?: string }): NotifyChannel
```

---

## 八、共享约定

### 8.1 统一响应格式

```typescript
// 成功
{ "code": 0, "message": "success", "data": T }

// 分页
{ "code": 0, "message": "success", "data": { "list": T[], "total": number, "page": number, "pageSize": number } }

// 错误
{ "code": number, "message": string, "data": null }
// code: 401=未认证 403=无权限 404=不存在 422=参数校验失败 429=限流 500=内部错误
```

### 8.2 ID 生成

所有表主键使用 `crypto.randomUUID()`，VARCHAR(36)。

### 8.3 软删除

需要软删除的表设置 `deleted_at TIMESTAMP` 字段，Model 定义 `softDelete: true`。

### 8.4 时间戳

所有表包含 `created_at` / `updated_at`，Model 定义 `timestamps: true`。ORM 自动维护。

### 8.5 脱敏规则

操作日志、登录日志中对以下字段自动脱敏：

- `password` / `passwordHash` / `oldPassword` / `newPassword` → `"***"`
- `token` / `accessToken` / `refreshToken` → `"***"`
- `secret` / `mfaSecret` → `"***"`
- `phone` → `"138****1234"`
- `email` → `"t****@example.com"`

### 8.6 权限标识命名规范

```
{module}:{entity}:{action}

示例：
system:user:list
system:user:query
system:user:create
system:user:update
system:user:delete
system:user:resetPwd
system:user:export
system:role:list
system:menu:list
system:dict:list
system:config:list
```

### 8.7 包配置模板

每个平台包的 `package.json` 统一结构：

```json
{
  "name": "@ventostack/system",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@ventostack/core": "workspace:*",
    "@ventostack/database": "workspace:*",
    "@ventostack/cache": "workspace:*",
    "@ventostack/auth": "workspace:*",
    "@ventostack/observability": "workspace:*",
    "@ventostack/events": "workspace:*"
  },
  "devDependencies": {
    "@ventostack/testing": "workspace:*"
  }
}
```
