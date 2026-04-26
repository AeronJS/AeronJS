/**
 * @ventostack/system - 中间件统一导出
 *
 * 提供系统管理相关的中间件：
 * - 认证中间件（createAuthMiddleware）：JWT Bearer Token 验证
 * - 权限中间件（createPermMiddleware）：RBAC 权限校验
 * - 操作日志中间件（createOperationLogMiddleware）：写操作审计记录
 */

export {
  createAuthMiddleware,
  createPermMiddleware,
  type AuthUser,
} from "./auth-guard";

export {
  createOperationLogMiddleware,
  type OperationLogOptions,
} from "./operation-log";
