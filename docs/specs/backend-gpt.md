一、基础内核能力（Runtime & Core）
1. 应用生命周期管理
启动 / 关闭 hooks（beforeStart / afterStart / beforeStop）
优雅关闭（graceful shutdown）
等待请求完成
连接池释放
多实例协调（配合 k8s readiness / liveness）
2. 配置系统（必须是强能力）
多来源：
env
文件（yaml/json/toml）
远程配置中心（etcd / consul / nacos）
分环境（dev / test / prod）
动态热更新（watch + callback）
类型安全（schema + validation）
敏感信息管理（secret / vault）

4. 模块化系统（Module System）
模块隔离（类似 NestJS Module）
模块依赖图（DAG）
插件化加载（plugin system）
支持按需加载（feature toggle）
二、Web / API 层能力（HTTP / RPC）
5. 路由系统
RESTful routing
参数绑定（path/query/body/header）
中间件链（middleware pipeline）
路由分组（versioning / prefix）
自动 OpenAPI 生成
6. 请求处理管线（Pipeline）
middleware / interceptor / filter 三层模型
支持：
logging
auth
rate limit
tracing
异常统一处理（global exception handler）
7. 多协议支持（必须）
HTTP（REST）
gRPC（强类型）
WebSocket（实时）
GraphQL（可选）
内部 RPC（service-to-service）
三、数据层能力（Data Layer）
8. 数据库抽象（ORM / Query Builder）
ORM + 原生 SQL 双模式
migration（版本管理）
connection pool
读写分离
多数据库支持（MySQL / PG / SQLite）
9. 缓存系统
多级缓存：
本地缓存（L1）
Redis（L2）
cache aside / write through
TTL / 自动失效
分布式一致性（避免 cache stampede）
10. 事务管理
本地事务（DB transaction）
分布式事务（Saga / TCC）
自动回滚机制
四、异步与任务系统
11. 消息队列支持
Kafka / RabbitMQ / NATS
producer / consumer 抽象
retry / dead letter queue
消息幂等性支持
12. 后台任务系统
cron job
延迟队列
分布式任务调度
任务可观测（状态 / retry / logs）
五、安全体系（Security）
13. 认证（Authentication）
JWT / Session / OAuth2
API Key
多端登录支持
14. 授权（Authorization）
RBAC
ABAC（高级）
资源级权限控制
15. 安全防护
CSRF / XSS / SQL Injection 防护
Rate limiting
IP 黑白名单
输入校验（强制）
六、可观测性（Observability）—这是很多人做不好但最关键的
16. 日志系统
structured logging（JSON）
trace id / span id
log level
log hook（发送到 ELK / Loki）
17. 指标（Metrics）
Prometheus 格式
QPS / latency / error rate
自定义业务指标
18. 分布式追踪（Tracing）
OpenTelemetry
Jaeger / Tempo
自动注入 trace context
七、开发体验（DX）
19. CLI 工具（必须有）
项目初始化（scaffold）
module/controller/service 生成
migration 生成
一键运行 / build / deploy
20. 热重载（Dev Mode）
文件变更自动 reload
保留状态（可选）
21. 测试体系
单元测试（unit test）
集成测试（integration test）
mock 支持
test container（数据库隔离）
八、部署与运行（Production Ready）
22. 容器化支持
Dockerfile 标准化
健康检查接口（/healthz）
readiness / liveness
23. 配合 Kubernetes
自动配置探针
graceful shutdown
配置注入（ConfigMap / Secret）
24. 灰度发布 / Feature Flag
按用户 / 流量切换
动态开关功能
九、扩展能力（Extensibility）
25. 插件系统（核心）
生命周期 hooks
插件注册机制
插件隔离（避免污染）
26. Hook / Event 机制
beforeRequest / afterResponse
domain events（领域事件）
十、性能与稳定性
27. 高并发能力
异步 IO（epoll/kqueue）
worker pool
backpressure（背压机制）
28. 限流与熔断
rate limiter（token bucket / leaky bucket）
circuit breaker（熔断）
fallback 机制
29. 资源管理
连接池（DB / HTTP）
内存控制
GC 优化（语言相关）
十一、工程级能力（你这种场景必须要）
30. API 版本管理
/v1 / v2
向后兼容策略
31. 多租户（Multi-tenancy）
tenant isolation
tenant-aware context
32. 审计日志（Audit Log）
谁在什么时候做了什么操作
不可篡改
十二、AI / Agent 时代
33. Tool / Command 抽象
标准化：
read
write
exec
query
schema 描述（给 LLM 用）
34. 权限沙箱
限制 AI 能执行的操作
command allowlist
35. 上下文系统
request context
user context
memory（短期/长期）