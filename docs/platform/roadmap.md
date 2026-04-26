# VentoStack 企业级平台能力 — 路线图

> 跟踪企业级平台能力的实施进度。与 `技术架构分析.md` 和 `技术实施.md` 配套使用。

---

## Phase 0 — 框架层安全修复与能力暴露

> **目标**：修复安全审查中发现的关键风险，暴露平台层需要的框架 API。
> **预计工作量**：~12 个文件变更
> **前置条件**：无

### 0.1 Token 吊销持久化

- [ ] 新增 `packages/auth/src/token-revocation-store.ts` — `TokenRevocationStore` 接口
- [ ] 实现内存版 `createMemoryRevocationStore()`
- [ ] 实现 Redis 版 `createRedisRevocationStore()`
- [ ] 改造 `packages/auth/src/token-refresh.ts` — 接受外部 `revocationStore`
- [ ] 补充单元测试

### 0.2 Session Store 批量销毁

- [ ] `SessionStore` 接口增加 `deleteByUser(userId)` 可选方法
- [ ] `SessionManager` 增加 `destroyByUser(userId)` 方法
- [ ] `createRedisSessionStore` 实现 `deleteByUser` + user→sessions 索引维护
- [ ] 补充单元测试

### 0.3 统一踢人链路

- [ ] 新增 `packages/auth/src/auth-session.ts` — `AuthSessionManager`
- [ ] 实现 `login()` — 创建 Session + 注册设备 + 签发 Token
- [ ] 实现 `logout()` — 销毁 Session + 移除设备 + 吊销 Token
- [ ] 实现 `forceLogout()` — 三步原子联动（Session + 设备 + Token 全量清除）
- [ ] 实现 `refreshTokens()` — 轮换 Refresh Token
- [ ] 导出新增类型和函数到 `index.ts`
- [ ] 补充集成测试（forceLogout 后 Token 确实失效）

### 0.4 TOTP 防重放

- [ ] `packages/auth/src/totp.ts` 增加 `verifyAndConsume()` 方法
- [ ] 内部维护已消费 `(secretHash, counter)` 集合 + 自动过期清理
- [ ] 补充单元测试

### 0.5 JWT typ 校验

- [ ] `packages/auth/src/jwt.ts` verify 方法增加 `typ` 头部校验
- [ ] 兼容无 `typ` 的旧 Token
- [ ] 补充单元测试

### 0.6 Tenant 校验 Hook

- [ ] `packages/core/src/middlewares/tenant.ts` 增加 `validateTenant` 可选钩子
- [ ] 补充单元测试

### 0.7 Scheduler 执行 Hook

- [ ] `packages/events/src/scheduler.ts` `ScheduleOptions` 增加执行钩子
- [ ] 在任务执行循环中调用 `onBeforeExecute` / `onAfterExecute` / `onError`
- [ ] 补充单元测试

### 0.8 暴露表结构读取 API

- [ ] 新增 `packages/database/src/schema-reader.ts` — `readTableSchema()` / `listTables()`
- [ ] 从 `schema-diff.ts` 抽取公共逻辑
- [ ] 导出到 `index.ts`
- [ ] 补充单元测试

### Phase 0 验收标准

- [ ] 所有新增/修改的测试通过
- [ ] 现有测试无回归
- [ ] `TokenRevocationStore` 在进程重启后仍可查询已吊销 Token
- [ ] `forceLogout()` 后，被踢用户的 JWT 在过期前也被拒绝
- [ ] TOTP `verifyAndConsume` 对同一 code 第二次调用返回 `false`

---

## Phase 1 — `@ventostack/system` 系统管理核心

> **目标**：企业后台骨架——认证业务流程 + 用户/角色/菜单/部门/岗位/字典/参数/公告
> **预计工作量**：~40 个文件
> **前置条件**：Phase 0 完成
> **依赖**：auth, database, cache, observability, core (rate-limit), events

### 1.0 工程准备

- [ ] 创建 `packages/platform/` 目录
- [ ] 更新根 `package.json` workspaces 增加 `"packages/platform/*"`
- [ ] 创建 `packages/platform/system/package.json`
- [ ] 创建 `packages/platform/system/tsconfig.json`
- [ ] 创建目录结构：`src/models/`, `src/services/`, `src/routes/`, `src/middlewares/`

### 1.1 数据库模型定义

- [ ] `models/user.ts` — `UserModel` (sys_user)
- [ ] `models/role.ts` — `RoleModel` (sys_role) + `UserRoleModel` (sys_user_role)
- [ ] `models/menu.ts` — `MenuModel` (sys_menu) + `RoleMenuModel` (sys_role_menu)
- [ ] `models/dept.ts` — `DeptModel` (sys_dept)
- [ ] `models/post.ts` — `PostModel` (sys_post) + `UserPostModel` (sys_user_post)
- [ ] `models/dict.ts` — `DictTypeModel` (sys_dict_type) + `DictDataModel` (sys_dict_data)
- [ ] `models/config.ts` — `ConfigModel` (sys_config)
- [ ] `models/notice.ts` — `NoticeModel` (sys_notice) + `UserNoticeModel` (sys_user_notice)
- [ ] `models/login-log.ts` — `LoginLogModel` (sys_login_log)
- [ ] `models/operation-log.ts` — `OperationLogModel` (sys_operation_log)
- [ ] `models/mfa-recovery.ts` — `MfaRecoveryModel` (sys_mfa_recovery)

### 1.2 迁移文件

- [ ] `migrations/001_create_sys_tables.ts` — 全部 15 张表建表 SQL
- [ ] `migrations/002_create_sys_indexes.ts` — 索引创建
- [ ] 迁移可执行验证

### 1.3 Seed 数据

- [ ] `seeds/001_init_admin.ts` — 管理员用户 + 管理员角色 + 基础菜单

### 1.4 Service 实现

#### AuthService（登录/注册/MFA/踢人）

- [ ] `services/auth.ts` — `createAuthService()`
- [ ] 登录流程（含暴力破解防护：IP+用户名双维度限流）
- [ ] 登出流程（联动 AuthSessionManager）
- [ ] Refresh Token 轮换
- [ ] 注册（含密码策略校验）
- [ ] 找回密码 / 重置密码
- [ ] 强制踢人
- [ ] MFA 开启（生成 QR Code + 恢复码）
- [ ] MFA 验证（独立限流）
- [ ] MFA 关闭
- [ ] MFA 恢复码登录
- [ ] 登录日志记录

#### UserService

- [ ] `services/user.ts` — `createUserService()`
- [ ] CRUD + 关联（角色、岗位、部门）
- [ ] 密码重置
- [ ] 状态变更（启用/禁用）
- [ ] 导出（CSV）

#### RoleService

- [ ] `services/role.ts` — `createRoleService()`
- [ ] CRUD
- [ ] 菜单权限分配（sys_role_menu）
- [ ] 数据权限范围分配

#### MenuService

- [ ] `services/menu.ts` — `createMenuService()`
- [ ] 树形 CRUD
- [ ] 按钮权限标识管理

#### DeptService

- [ ] `services/dept.ts` — `createDeptService()`
- [ ] 组织架构树 CRUD

#### PostService

- [ ] `services/post.ts` — `createPostService()`
- [ ] 岗位 CRUD

#### DictService

- [ ] `services/dict.ts` — `createDictService()`
- [ ] 字典类型 + 字典数据 CRUD
- [ ] 字典缓存策略（`cache.remember()` + 写时刷新）
- [ ] 前端下拉接口

#### ConfigService

- [ ] `services/config.ts` — `createConfigService()`
- [ ] 系统参数 CRUD
- [ ] 参数缓存策略
- [ ] 运行时取值接口

#### NoticeService

- [ ] `services/notice.ts` — `createNoticeService()`
- [ ] 公告 CRUD
- [ ] 发布/撤回
- [ ] 已读未读

#### PermissionLoader

- [ ] `services/permission-loader.ts` — `createPermissionLoader()`
- [ ] 启动时从 DB 加载角色-权限到 RBAC 引擎
- [ ] 角色变更时热更新
- [ ] 数据权限规则加载到 RowFilter

#### MenuTreeBuilder

- [ ] `services/menu-tree-builder.ts` — `createMenuTreeBuilder()`
- [ ] 根据用户角色生成前端动态路由树
- [ ] 根据用户角色生成权限标识列表

### 1.5 路由实现

- [ ] `routes/auth.ts` — 登录/登出/刷新/注册/找回密码/MFA（含独立限流）
- [ ] `routes/user.ts` — 用户管理 CRUD
- [ ] `routes/role.ts` — 角色管理 CRUD + 权限分配
- [ ] `routes/menu.ts` — 菜单管理 CRUD
- [ ] `routes/dept.ts` — 部门管理 CRUD
- [ ] `routes/post.ts` — 岗位管理 CRUD
- [ ] `routes/dict.ts` — 字典管理 + 前端下拉
- [ ] `routes/config.ts` — 系统参数管理
- [ ] `routes/notice.ts` — 公告管理
- [ ] `routes/log.ts` — 操作日志 + 登录日志查询（只读）
- [ ] `routes/user-routes.ts` — 当前用户路由树 + 权限列表

### 1.6 中间件

- [ ] `middlewares/auth-guard.ts` — `authRequired` + `permRequired(resource, action)`
- [ ] `middlewares/operation-log.ts` — 自动记录操作日志（脱敏）
- [ ] `middlewares/login-rate-limit.ts` — 登录/MFA 限流中间件

### 1.7 Module 聚合

- [ ] `module.ts` — `createSystemModule()` 聚合所有 Service 和路由
- [ ] `index.ts` — 导出所有公共 API

### 1.8 测试

#### Service 单元测试

- [ ] `tests/services/auth.test.ts`
- [ ] `tests/services/user.test.ts`
- [ ] `tests/services/role.test.ts`
- [ ] `tests/services/menu.test.ts`
- [ ] `tests/services/dept.test.ts`
- [ ] `tests/services/dict.test.ts`
- [ ] `tests/services/config.test.ts`
- [ ] `tests/services/notice.test.ts`
- [ ] `tests/services/permission-loader.test.ts`
- [ ] `tests/services/menu-tree-builder.test.ts`

#### 路由集成测试

- [ ] `tests/routes/auth.test.ts` — 登录/登出/刷新/MFA 完整流程
- [ ] `tests/routes/user.test.ts` — 用户 CRUD + 权限校验
- [ ] `tests/routes/role.test.ts`
- [ ] `tests/routes/menu.test.ts`

#### 安全回归测试

- [ ] `tests/security/auth.test.ts` — 暴力破解/越权/注入/踢人/MFA 重放
- [ ] `tests/security/permission.test.ts` — RBAC 权限校验 / 数据权限

### Phase 1 验收标准

- [ ] `bun test packages/platform/system` 全部通过
- [ ] 登录 → 获取 Token → 访问受保护端点 → 登出 完整流程通畅
- [ ] 连续 5 次登录失败后账户被锁定
- [ ] 强制踢人后用户无法继续使用任何 Token
- [ ] MFA 绑定 → 验证 → 解绑流程正常
- [ ] TOTP code 同一时间窗口不可重放
- [ ] 无权限用户访问受保护端点返回 403
- [ ] 字典/参数缓存写后读一致
- [ ] 操作日志自动记录且敏感字段已脱敏

---

## Phase 2 — `@ventostack/oss` + `@ventostack/scheduler`

> **前置条件**：Phase 1 完成

### 2.1 `@ventostack/oss` — 文件存储服务

#### 工程准备

- [ ] 创建 `packages/platform/oss/` 目录结构和 `package.json`

#### 数据库模型

- [ ] `models/oss-file.ts` — `OSSFileModel` (sys_oss_file)
- [ ] 迁移文件

#### 存储适配器

- [ ] `adapters/storage.ts` — `StorageAdapter` 接口
- [ ] `adapters/local-storage.ts` — `createLocalStorage()`
- [ ] `adapters/s3-storage.ts` — `createS3Storage()`

#### Service 与路由

- [ ] `services/mime-detect.ts` — Magic-Byte MIME 检测
- [ ] `services/oss.ts` — `createOSSService()`
- [ ] `routes/oss.ts` — 上传/下载/删除/签名 URL
- [ ] `module.ts` — `createOSSModule()`
- [ ] `index.ts` — 导出

#### 测试

- [ ] `tests/adapters/local-storage.test.ts`
- [ ] `tests/services/oss.test.ts`
- [ ] `tests/routes/oss.test.ts`

### 2.2 `@ventostack/scheduler` — 定时任务管理

#### 工程准备

- [ ] 创建 `packages/platform/scheduler/` 目录结构和 `package.json`

#### 数据库模型

- [ ] `models/schedule-job.ts` — `ScheduleJobModel` (sys_schedule_job) + `ScheduleJobLogModel` (sys_schedule_job_log)
- [ ] 迁移文件

#### Service 与路由

- [ ] `services/scheduler.ts` — `createSchedulerModule()` — 对接 events Scheduler Hook
- [ ] `routes/scheduler.ts` — 任务 CRUD + 启停 + 立即执行 + 日志查询
- [ ] Cron 表达式校验工具
- [ ] `module.ts` — `createSchedulerModule()`
- [ ] `index.ts` — 导出

#### 测试

- [ ] `tests/services/scheduler.test.ts`
- [ ] `tests/routes/scheduler.test.ts`

### Phase 2 验收标准

- [ ] 文件上传后可下载，MIME 类型经过服务端校验
- [ ] 签名 URL 可访问私有文件且在过期后失效
- [ ] 定时任务创建后可启动/暂停
- [ ] 任务执行日志被正确记录（开始时间、结束时间、状态、耗时）
- [ ] 任务执行失败后触发 `scheduler.job.failed` 事件

---

## Phase 3 — `@ventostack/gen` + `@ventostack/monitor` + `@ventostack/notification`

> **前置条件**：Phase 2 完成

### 3.1 `@ventostack/gen` — 代码生成器

#### 工程准备

- [ ] 创建 `packages/platform/gen/` 目录结构和 `package.json`

#### 数据库模型

- [ ] `models/gen-table.ts` — `GenTableModel` (sys_gen_table) + `GenTableColumnModel` (sys_gen_table_column)
- [ ] 迁移文件

#### Service

- [ ] `services/gen.ts` — `createGenService()`
- [ ] 导入表结构（调用 `readTableSchema()`）
- [ ] 字段配置管理
- [ ] 代码生成（模板渲染）

#### 代码模板

- [ ] `templates/model.ts.tmpl`
- [ ] `templates/service.ts.tmpl`
- [ ] `templates/routes.ts.tmpl`
- [ ] `templates/types.ts.tmpl`
- [ ] `templates/test.ts.tmpl`

#### CLI 扩展

- [ ] `cli-plugin.ts` — `registerGenCommand()`

#### 测试

- [ ] `tests/services/gen.test.ts`
- [ ] `tests/templates/render.test.ts`

### 3.2 `@ventostack/monitor` — 系统监控

#### 工程准备

- [ ] 创建 `packages/platform/monitor/` 目录结构和 `package.json`

#### Service 与路由

- [ ] `services/monitor.ts` — `createMonitorService()`
- [ ] 在线用户会话列表
- [ ] 强制踢人（复用 AuthSessionManager）
- [ ] 服务器状态（CPU/内存/磁盘/运行时间）
- [ ] 缓存监控（Key 数量/命中率/内存）
- [ ] 数据源监控（连接池状态）
- [ ] 健康检查聚合（复用 observability HealthCheck）
- [ ] `routes/monitor.ts` — REST API
- [ ] `module.ts` — `createMonitorModule()`

#### 测试

- [ ] `tests/services/monitor.test.ts`

### 3.3 `@ventostack/notification` — 消息中心

#### 工程准备

- [ ] 创建 `packages/platform/notification/` 目录结构和 `package.json`

#### 数据库模型

- [ ] `models/template.ts` — `NotifyTemplateModel` (sys_notify_template)
- [ ] `models/message.ts` — `NotifyMessageModel` (sys_notify_message) + `NotifyUserReadModel` (sys_notify_user_read)
- [ ] 迁移文件

#### 渠道适配器

- [ ] `channels/smtp.ts` — `createSMTPChannel()`
- [ ] `channels/sms.ts` — `createSMSChannel()`
- [ ] `channels/webhook.ts` — `createWebhookChannel()`

#### Service 与路由

- [ ] `services/notification.ts` — `createNotificationService()`
- [ ] 模板管理 CRUD
- [ ] 站内信发送/已读/未读
- [ ] 邮件/短信发送
- [ ] `routes/notification.ts` — REST API
- [ ] `module.ts` — `createNotificationModule()`

#### 测试

- [ ] `tests/services/notification.test.ts`
- [ ] `tests/channels/smtp.test.ts`

### Phase 3 验收标准

- [ ] `bun run gen import sys_user` 可导入表结构
- [ ] `bun run gen generate <id>` 可生成 Model / Service / Router 代码
- [ ] 监控 API 返回服务器状态、在线用户、缓存命中率
- [ ] 站内信发送后接收方可查看并标记已读
- [ ] 邮件模板渲染变量替换正确

---

## Phase 4 — `@ventostack/i18n` + `@ventostack/workflow` + `@ventostack/boot`

> **前置条件**：Phase 3 完成
> **说明**：按需启动，以下为初步规划。

### 4.1 `@ventostack/i18n` — 国际化

- [ ] 工程准备（package.json + 目录结构）
- [ ] `sys_i18n_locale` — 语言包表
- [ ] `sys_i18n_resource` — 翻译资源表
- [ ] `services/i18n.ts` — 语言包 CRUD + 运行时翻译接口
- [ ] `routes/i18n.ts` — REST API
- [ ] 缓存策略（语言包加载后缓存）
- [ ] 测试

### 4.2 `@ventostack/workflow` — 工作流引擎

- [ ] 工程准备
- [ ] `sys_workflow_definition` — 流程定义表
- [ ] `sys_workflow_instance` — 流程实例表
- [ ] `sys_workflow_task` — 任务节点表
- [ ] 流程引擎核心（状态机 + 审批链）
- [ ] 审批操作（同意/拒绝/转办/退回）
- [ ] REST API
- [ ] 测试

### 4.3 `@ventostack/boot` — 聚合包

- [ ] 工程准备
- [ ] `createPlatform()` — 统一初始化
- [ ] 按需加载平台模块配置
- [ ] 自动注册路由和中间件
- [ ] 文档与示例

### 4.4 Feature Toggle 持久化（框架层增强）

- [ ] `packages/core/src/feature-toggle.ts` 增加外部 Store 接口
- [ ] Redis 持久化适配器
- [ ] 测试

---

## 进度总览

| Phase | 包 | 状态 | 测试 |
|-------|----|------|------|
| **Phase 0** | 框架层安全修复 | ⬜ 未开始 | ⬜ |
| **Phase 1** | `@ventostack/system` | ⬜ 未开始 | ⬜ |
| **Phase 2** | `@ventostack/oss` | ⬜ 未开始 | ⬜ |
| **Phase 2** | `@ventostack/scheduler` | ⬜ 未开始 | ⬜ |
| **Phase 3** | `@ventostack/gen` | ⬜ 未开始 | ⬜ |
| **Phase 3** | `@ventostack/monitor` | ⬜ 未开始 | ⬜ |
| **Phase 3** | `@ventostack/notification` | ⬜ 未开始 | ⬜ |
| **Phase 4** | `@ventostack/i18n` | ⬜ 未开始 | ⬜ |
| **Phase 4** | `@ventostack/workflow` | ⬜ 未开始 | ⬜ |
| **Phase 4** | `@ventostack/boot` | ⬜ 未开始 | ⬜ |
