# 成熟后端开发框架必备功能清单

---

## 一、核心基础层

### 1. 路由系统
- 静态路由 / 动态路由（`:id`、`*wildcard`）
- 路由分组与嵌套（`/api/v1/users`）
- RESTful 路由快捷注册（`GET/POST/PUT/PATCH/DELETE`）
- 路由命名与反向生成 URL
- 路由参数类型约束与正则匹配
- 路由冲突检测与优先级排序
- 支持 WebSocket / SSE 路由

### 2. 中间件系统
- 全局中间件 / 路由级中间件 / 分组中间件
- 中间件洋葱模型（`before → handler → after`）
- 内置常用中间件：CORS、限流、压缩、日志、鉴权、超时控制
- 中间件链的中断与跳过机制

### 3. 请求 / 响应封装
- 统一 `Context` 对象（Request + Response + 元数据）
- Query / Path / Header / Body / Form / File 参数解析
- 自动绑定（JSON / XML / Form → Struct）
- 参数验证（必填、类型、范围、正则、自定义规则）
- 响应统一封装（code/message/data 结构）
- 流式响应、文件下载、重定向
- 内容协商（`Accept` 头自动选择序列化格式）

---

## 二、数据访问层

### 4. ORM / 数据库抽象
- 链式查询构造器（`Where / Select / Join / Group / Having / Order / Limit`）
- CRUD 基础操作封装
- 事务支持（嵌套事务 / Savepoint）
- 批量插入 / 更新
- 软删除
- 乐观锁（版本号/时间戳）
- 关联关系：一对一、一对多、多对多、Eager Loading / Lazy Loading
- 原生 SQL 支持与防注入
- 多数据库类型驱动（MySQL / PostgreSQL / SQLite / MSSQL）
- 读写分离 / 多数据源切换
- 连接池管理（最大连接数、空闲连接、超时回收）

### 5. 数据库迁移
- 版本化 Migration 文件（`up` / `down`）
- 自动检测 Schema 差异
- Seed 数据填充
- 迁移状态记录与回滚

### 6. 缓存系统
- 统一缓存接口（支持 Redis / Memcached / 内存）
- 设置 TTL / 永久缓存
- 标签缓存（按 tag 批量失效）
- 缓存穿透防护（`singleflight` / 空值缓存）
- 缓存雪崩防护（随机 TTL 抖动）
- 分布式锁（基于 Redis `SET NX EX`）
- 二级缓存（本地 L1 + 远端 L2）

---

## 三、安全体系

### 7. 认证系统
- Session / Cookie 认证
- JWT 生成、解析、刷新、黑名单吊销
- OAuth2.0 / OIDC 集成（第三方登录）
- API Key 认证
- 多因素认证（TOTP / SMS）

### 8. 授权系统
- RBAC（角色-权限-资源）
- ABAC（基于属性的访问控制）
- 策略引擎（Casbin 等）
- 资源级权限细控（数据行过滤）

### 9. 安全防护
- SQL 注入防护（参数化查询）
- XSS 过滤
- CSRF Token 验证
- 请求签名验证（HMAC）
- 敏感数据加密（AES / RSA / bcrypt 密码哈希）
- 请求频率限制（IP / 用户 / 接口维度）
- IP 黑白名单
- HTTPS 强制与 HSTS

---

## 四、工程化能力

### 10. 配置管理
- 多环境配置（dev / test / staging / prod）
- 支持 YAML / TOML / JSON / ENV / 远程配置中心（Consul / Nacos / etcd）
- 配置热更新（不重启生效）
- 敏感配置加密存储
- 配置优先级覆盖（文件 < 环境变量 < 命令行参数）

### 11. 依赖注入（DI）
- 容器自动注册与解析
- 构造函数注入 / 接口注入
- 单例 / 多例 / 懒加载
- 生命周期管理（Singleton / Transient / Scoped）
- 循环依赖检测

### 12. 日志系统
- 分级日志（DEBUG / INFO / WARN / ERROR / FATAL）
- 结构化日志（JSON 格式，便于 ELK 接入）
- 请求追踪 ID（TraceID / SpanID）自动注入
- 日志文件轮转（按大小 / 日期）
- 异步写入（避免阻塞业务）
- 敏感字段脱敏（手机号、身份证、密码）
- 多输出目标（控制台 + 文件 + 远程）

### 13. 错误处理
- 全局统一异常捕获（Panic Recovery）
- 自定义业务错误码体系
- 错误链（Wrapping / Unwrapping）
- 区分 4xx（客户端错误）与 5xx（服务端错误）
- 错误上报（Sentry / 钉钉告警）

---

## 五、异步与并发

### 14. 任务队列 / 消息队列
- 异步任务投递（延迟任务、定时任务）
- 可靠投递（持久化 + ACK 确认）
- 死信队列（DLQ）处理
- 优先级队列
- 支持后端：Redis / RabbitMQ / Kafka / RocketMQ

### 15. 定时任务
- Cron 表达式支持
- 分布式任务调度（防重复执行，抢锁机制）
- 任务执行历史记录
- 任务超时与重试策略
- 优雅停止（正在执行的任务不被强杀）

### 16. 事件系统
- 同步 / 异步事件分发
- 监听器注册（支持多监听者）
- 事件队列化处理
- 事件溯源支持

---

## 六、可观测性

### 17. 链路追踪
- 集成 OpenTelemetry（分布式 Trace）
- 自动注入 TraceID 到日志
- 跨服务 Context 传播（W3C TraceContext / B3）
- 接入 Jaeger / Zipkin / SkyWalking

### 18. 指标监控
- 暴露 `/metrics` 接口（Prometheus 格式）
- 内置指标：QPS、响应时延（P50/P95/P99）、错误率、连接池状态
- 自定义业务指标注册
- 与 Grafana Dashboard 集成

### 19. 健康检查
- `/health/live`（存活探针）
- `/health/ready`（就绪探针）
- 各依赖项状态检查（DB / Redis / MQ）
- 对接 Kubernetes 探针

---

## 七、接口能力

### 20. API 文档
- 注解 / 代码生成 Swagger / OpenAPI 3.0 文档
- 在线调试界面（Swagger UI / Redoc）
- 文档版本管理
- 接口变更 Diff

### 21. API 版本管理
- URL 版本（`/api/v1/`）
- Header 版本（`Accept: application/vnd.api+json;version=2`）
- 旧版本兼容与废弃通知

### 22. GraphQL 支持（可选）
- Schema 定义与解析器注册
- N+1 查询优化（DataLoader）
- 订阅（Subscription）

---

## 八、微服务支持

### 23. 服务注册与发现
- 集成 Consul / Nacos / etcd / Kubernetes Service
- 健康心跳上报
- 服务元数据注册

### 24. 负载均衡
- 客户端负载均衡（轮询 / 加权 / 最少连接 / 一致性哈希）
- 熔断器（Circuit Breaker，Hystrix / Sentinel 模式）
- 降级策略（fallback 函数）
- 超时与重试（指数退避 + 抖动）

### 25. RPC / 内部通信
- HTTP/2 + gRPC 支持
- Protocol Buffers 代码生成
- 服务间认证（mTLS）

---

## 九、测试能力

### 26. 测试工具链
- 单元测试：Mock 注入（接口替换），不依赖外部服务
- 集成测试：内置测试服务器（不需真实启动进程）
- 接口测试：HTTP Client 封装，断言响应
- 数据库测试：事务回滚隔离，测试结束自动清理
- 工厂模式造数据（Fixture / Factory）
- 覆盖率报告生成

---

## 十、部署与运维

### 27. 优雅启停
- 启动前依赖检查（DB 连通、配置完整性）
- 接收 `SIGTERM` 信号后停止接收新请求
- 等待存量请求处理完毕再退出（Graceful Shutdown，可配超时）
- 热重启（不中断连接升级进程）

### 28. 容器化支持
- 官方提供最小化 Dockerfile
- 支持非 root 用户运行
- 多阶段构建减小镜像体积
- 环境变量配置驱动（12-Factor）

### 29. CLI 脚手架
- 一键创建项目骨架（`init`）
- 代码生成（`generate model/controller/migration`）
- 数据库迁移命令（`migrate up/down/status`）
- 构建、测试、部署命令封装

---

## 十一、扩展生态

### 30. 插件 / 扩展机制
- 官方插件市场或注册表
- 第三方插件统一接入规范
- Hook 点暴露（生命周期钩子）
- 模块化按需加载（减少二进制体积）

---

> **核心原则**：以上功能不必全部内置，但框架必须提供**清晰的扩展点**和**官方推荐集成方案**，让开发者能以最低成本接入。缺失的功能比设计不良的功能危害更小——`约定优于配置`，同时保留逃生舱口。