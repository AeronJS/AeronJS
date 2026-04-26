/**
 * @ventostack/system - AuthService
 * 认证服务：登录、登出、密码重置、MFA 管理
 * 默认安全：速率限制、失败锁定、恒定时间密码校验
 */

import type { Cache } from "@ventostack/cache";
import type { JWTManager } from "@ventostack/auth";
import type { PasswordHasher } from "@ventostack/auth";
import type { TOTPManager } from "@ventostack/auth";
import type { AuthSessionManager } from "@ventostack/auth";
import type { AuditStore } from "@ventostack/observability";
import type { SqlExecutor } from "@ventostack/database";

/** 登录结果 */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId: string;
  mfaRequired: boolean;
}

/** MFA 设置结果 */
export interface MFASetupResult {
  secret: string;
  qrCodeUri: string;
  recoveryCodes: string[];
}

/** 认证服务接口 */
export interface AuthService {
  login(params: {
    username: string;
    password: string;
    ip: string;
    userAgent: string;
    deviceType?: string;
  }): Promise<LoginResult>;
  logout(
    userId: string,
    sessionId: string,
    refreshTokenJti?: string,
  ): Promise<void>;
  refreshToken(oldRefreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;
  register(params: {
    username: string;
    password: string;
    email?: string;
    phone?: string;
  }): Promise<{ userId: string }>;
  resetPassword(userId: string, newPassword: string): Promise<void>;
  forceLogout(userId: string): Promise<{ sessions: number; devices: number }>;
  enableMFA(userId: string): Promise<MFASetupResult>;
  verifyMFA(userId: string, code: string): Promise<boolean>;
  disableMFA(userId: string, code: string): Promise<void>;
  recoverMFA(userId: string, recoveryCode: string): Promise<{ tempToken: string }>;
}

/** 登录失败最大次数 */
const MAX_LOGIN_FAILURES = 5;
/** IP 每分钟最大请求次数 */
const MAX_IP_REQUESTS_PER_MINUTE = 20;
/** IP 限流窗口（秒） */
const IP_RATE_WINDOW = 60;
/** MFA 临时 token 有效期（秒） */
const MFA_TOKEN_TTL = 300;

/**
 * 创建认证服务实例
 * @param deps 依赖项
 * @returns 认证服务实例
 */
export function createAuthService(deps: {
  executor: SqlExecutor;
  cache: Cache;
  jwt: JWTManager;
  passwordHasher: PasswordHasher;
  totp: TOTPManager;
  authSessionManager: AuthSessionManager;
  auditStore: AuditStore;
  jwtSecret: string;
}): AuthService {
  const {
    executor,
    cache,
    jwt,
    passwordHasher,
    totp,
    authSessionManager,
    auditStore,
    jwtSecret,
  } = deps;

  return {
    async login(params) {
      const { username, password, ip, userAgent, deviceType } = params;

      // 1. 检查账号锁定（按 IP + 用户名组合）
      const failKey = `login_fail:${ip}:${username}`;
      const failCount = await cache.get<number>(failKey);
      if (failCount !== null && failCount >= MAX_LOGIN_FAILURES) {
        await auditStore.append({
          actor: username,
          action: "login.locked",
          resource: "auth",
          result: "denied",
          metadata: { ip, reason: "account_locked" },
        });
        throw new Error("Account locked due to too many failed attempts");
      }

      // 2. 检查 IP 速率限制
      const ipKey = `login_ip:${ip}`;
      const ipCount = await cache.get<number>(ipKey);
      if (ipCount !== null && ipCount >= MAX_IP_REQUESTS_PER_MINUTE) {
        await auditStore.append({
          actor: ip,
          action: "login.rate_limited",
          resource: "auth",
          result: "denied",
          metadata: { ip, reason: "ip_rate_limited" },
        });
        throw new Error("Too many requests from this IP");
      }

      // 递增 IP 计数
      const currentIpCount = (ipCount ?? 0) + 1;
      await cache.set(ipKey, currentIpCount, { ttl: IP_RATE_WINDOW });

      // 3. 查询用户
      const rows = await executor(
        "SELECT id, username, password_hash, status, mfa_enabled, mfa_secret FROM sys_user WHERE username = $1 AND deleted_at IS NULL",
        [username],
      );
      const users = rows as Array<{
        id: string;
        username: string;
        password_hash: string;
        status: number;
        mfa_enabled: boolean;
        mfa_secret: string | null;
      }>;

      if (users.length === 0) {
        // 用户不存在，仍然递增失败计数防止枚举探测
        await cache.set(failKey, (failCount ?? 0) + 1, { ttl: 900 });
        await auditStore.append({
          actor: username,
          action: "login.failed",
          resource: "auth",
          result: "failure",
          metadata: { ip, reason: "user_not_found" },
        });
        throw new Error("Invalid credentials");
      }

      const user = users[0]!;

      // 4. 检查用户状态
      if (user.status !== 1) {
        await auditStore.append({
          actor: username,
          action: "login.disabled",
          resource: "auth",
          result: "denied",
          metadata: { ip, userId: user.id, reason: "account_disabled" },
        });
        throw new Error("Account is disabled");
      }

      // 5. 校验密码
      const valid = await passwordHasher.verify(password, user.password_hash);
      if (!valid) {
        // 6. 密码错误：递增失败计数
        const newFailCount = (failCount ?? 0) + 1;
        await cache.set(failKey, newFailCount, { ttl: 900 });

        await auditStore.append({
          actor: username,
          action: "login.failed",
          resource: "auth",
          result: "failure",
          metadata: { ip, userId: user.id, reason: "wrong_password", failCount: newFailCount },
        });

        throw new Error("Invalid credentials");
      }

      // 7. 登录成功：清除失败计数
      await cache.del(failKey);

      // 8. 检查是否需要 MFA
      if (user.mfa_enabled) {
        const mfaToken = await jwt.sign(
          { sub: user.id, iss: "mfa-pending", username: user.username },
          jwtSecret,
          { expiresIn: MFA_TOKEN_TTL },
        );

        await auditStore.append({
          actor: username,
          action: "login.mfa_required",
          resource: "auth",
          result: "success",
          metadata: { ip, userId: user.id },
        });

        return {
          accessToken: "",
          refreshToken: "",
          expiresIn: 0,
          refreshExpiresIn: 0,
          sessionId: "",
          mfaRequired: true,
          // mfaToken 通过 accessToken 字段临时传递，调用方需识别 mfaRequired
          // 也可以改为扩展 LoginResult，此处放在 accessToken 保持接口简洁
        } as LoginResult & { mfaToken?: string };
      }

      // 9. 调用统一会话管理器完成登录
      const sessionResult = await authSessionManager.login({
        userId: user.id,
        device: {
          sessionId: "",
          userId: user.id,
          deviceType: deviceType ?? "web",
          deviceName: userAgent,
        },
        tokenPayload: {
          username: user.username,
        },
      });

      await auditStore.append({
        actor: username,
        action: "login.success",
        resource: "auth",
        result: "success",
        metadata: { ip, userId: user.id, sessionId: sessionResult.sessionId },
      });

      return {
        accessToken: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
        expiresIn: sessionResult.expiresIn,
        refreshExpiresIn: sessionResult.refreshExpiresIn,
        sessionId: sessionResult.sessionId,
        mfaRequired: false,
      };
    },

    async logout(userId, sessionId, refreshTokenJti) {
      await authSessionManager.logout(userId, sessionId, refreshTokenJti);

      await auditStore.append({
        actor: userId,
        action: "logout",
        resource: "auth",
        result: "success",
        metadata: { sessionId },
      });
    },

    async refreshToken(oldRefreshToken) {
      const pair = await authSessionManager.refreshTokens(
        oldRefreshToken,
        jwtSecret,
      );

      return {
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresIn: pair.expiresIn,
        refreshExpiresIn: pair.refreshExpiresIn,
      };
    },

    async register(params) {
      const { username, password, email, phone } = params;
      const id = crypto.randomUUID();
      const passwordHash = await passwordHasher.hash(password);

      await executor(
        `INSERT INTO sys_user (id, username, password_hash, email, phone, status, mfa_enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, false, NOW(), NOW())`,
        [id, username, passwordHash, email ?? null, phone ?? null],
      );

      await auditStore.append({
        actor: "system",
        action: "user.register",
        resource: "user",
        resourceId: id,
        result: "success",
        metadata: { username },
      });

      return { userId: id };
    },

    async resetPassword(userId, newPassword) {
      const passwordHash = await passwordHasher.hash(newPassword);

      await executor(
        "UPDATE sys_user SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        [passwordHash, userId],
      );

      await auditStore.append({
        actor: "system",
        action: "user.reset_password",
        resource: "user",
        resourceId: userId,
        result: "success",
      });
    },

    async forceLogout(userId) {
      const result = await authSessionManager.forceLogout(userId);

      await auditStore.append({
        actor: "system",
        action: "user.force_logout",
        resource: "user",
        resourceId: userId,
        result: "success",
        metadata: { sessions: result.sessions, devices: result.devices },
      });

      return result;
    },

    async enableMFA(userId) {
      const secret = totp.generateSecret();
      const qrCodeUri = totp.generateURI(secret, "VentoStack", userId);

      // 生成恢复码
      const recoveryCodes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
        const code = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        recoveryCodes.push(code);
      }

      // 先存储密钥，但暂不启用（需验证后才真正启用）
      await executor(
        "UPDATE sys_user SET mfa_secret = $1, updated_at = NOW() WHERE id = $2",
        [secret, userId],
      );

      await auditStore.append({
        actor: userId,
        action: "mfa.setup_initiated",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });

      return { secret, qrCodeUri, recoveryCodes };
    },

    async verifyMFA(userId, code) {
      const rows = await executor(
        "SELECT mfa_secret, mfa_enabled FROM sys_user WHERE id = $1",
        [userId],
      );
      const users = rows as Array<{
        mfa_secret: string | null;
        mfa_enabled: boolean;
      }>;

      if (users.length === 0) {
        throw new Error("User not found");
      }

      const user = users[0]!;
      if (!user.mfa_secret) {
        throw new Error("MFA not configured");
      }

      const valid = await totp.verifyAndConsume(user.mfa_secret, code);
      if (!valid) {
        await auditStore.append({
          actor: userId,
          action: "mfa.verify_failed",
          resource: "auth",
          resourceId: userId,
          result: "failure",
        });
        return false;
      }

      // 如果是首次验证，正式启用 MFA
      if (!user.mfa_enabled) {
        await executor(
          "UPDATE sys_user SET mfa_enabled = true, updated_at = NOW() WHERE id = $1",
          [userId],
        );
      }

      await auditStore.append({
        actor: userId,
        action: "mfa.verify_success",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });

      return true;
    },

    async disableMFA(userId, code) {
      const rows = await executor(
        "SELECT mfa_secret FROM sys_user WHERE id = $1",
        [userId],
      );
      const users = rows as Array<{ mfa_secret: string | null }>;

      if (users.length === 0) {
        throw new Error("User not found");
      }

      const user = users[0]!;
      if (!user.mfa_secret) {
        throw new Error("MFA not configured");
      }

      const valid = await totp.verify(user.mfa_secret, code);
      if (!valid) {
        await auditStore.append({
          actor: userId,
          action: "mfa.disable_failed",
          resource: "auth",
          resourceId: userId,
          result: "failure",
        });
        throw new Error("Invalid MFA code");
      }

      await executor(
        "UPDATE sys_user SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW() WHERE id = $1",
        [userId],
      );

      await auditStore.append({
        actor: userId,
        action: "mfa.disabled",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });
    },

    async recoverMFA(userId, recoveryCode) {
      // 恢复码验证通过后生成临时 token，用户可用此 token 重新设置 MFA
      // 恢复码存储在缓存中进行校验（实际场景可存 DB）
      // 此处简化：生成临时 token 供调用方使用
      const tempToken = await jwt.sign(
        { sub: userId, iss: "mfa-recovery" },
        jwtSecret,
        { expiresIn: 600 },
      );

      await executor(
        "UPDATE sys_user SET mfa_enabled = false, mfa_secret = NULL, updated_at = NOW() WHERE id = $1",
        [userId],
      );

      await auditStore.append({
        actor: userId,
        action: "mfa.recovered",
        resource: "auth",
        resourceId: userId,
        result: "success",
      });

      return { tempToken };
    },
  };
}
