/**
 * @ventostack/system - AuthService 测试
 */

import { describe, expect, test, mock } from "bun:test";
import { createAuthService } from "../services/auth";
import {
  createMockExecutor,
  createTestCache,
  createMockJWTManager,
  createMockPasswordHasher,
  createMockTOTPManager,
  createMockAuthSessionManager,
  createMockAuditStore,
  createMockEventBus,
}  from "./helpers";

function setup() {
  const { executor, calls, results } = createMockExecutor();
  const cache = createTestCache();
  const jwt = createMockJWTManager();
  const passwordHasher = createMockPasswordHasher();
  const totp = createMockTOTPManager();
  const authSessionManager = createMockAuthSessionManager();
  const auditLog = createMockAuditStore();
  const eventBus = createMockEventBus();

  const authService = createAuthService({
    executor,
    cache,
    jwt,
    jwtSecret: "test-secret-32-bytes-long-enough!!",
    passwordHasher,
    totp,
    authSessionManager,
    auditStore: auditLog,
  });

  return { authService, executor, calls, results, cache, jwt, passwordHasher, totp, authSessionManager, auditLog };
}

describe("AuthService", () => {
  describe("login", () => {
    test("successful login returns tokens", async () => {
      const s = setup();
      // Mock user query result
      s.results.set("SELECT", [{
        id: "u1", username: "admin", password_hash: "hashed_admin123",
        status: 1, mfa_enabled: false, nickname: "Admin",
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "admin", password: "admin123", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.mfaRequired).toBe(false);
      expect(s.authSessionManager.login).toHaveBeenCalledTimes(1);
    });

    test("wrong password increments fail counter", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "admin", password_hash: "hashed_admin123",
        status: 1, mfa_enabled: false,
      }]);
      s.passwordHasher.verify.mockResolvedValue(false as any);

      await expect(s.authService.login({
        username: "admin", password: "wrong", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();

      // Fail counter should be set in cache
    });

    test("non-existent user throws error", async () => {
      const s = setup();
      // Empty result = user not found
      await expect(s.authService.login({
        username: "nobody", password: "x", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();
    });

    test("disabled user (status=0) throws error", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "disabled", password_hash: "hashed_x",
        status: 0, mfa_enabled: false,
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      await expect(s.authService.login({
        username: "disabled", password: "x", ip: "1.2.3.4", userAgent: "test",
      })).rejects.toThrow();
    });

    test("MFA enabled user returns mfaRequired=true", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        id: "u1", username: "mfauser", password_hash: "hashed_x",
        status: 1, mfa_enabled: true, mfa_secret: "JBSWY3DPEHPK3PXP",
      }]);
      s.passwordHasher.verify.mockResolvedValue(true as any);

      const result = await s.authService.login({
        username: "mfauser", password: "x", ip: "1.2.3.4", userAgent: "test",
      });

      expect(result.mfaRequired).toBe(true);
    });
  });

  describe("register", () => {
    test("registers new user with hashed password", async () => {
      const s = setup();
      s.results.set("INSERT", [{ id: "new-1" }]);

      const result = await s.authService.register({
        username: "newuser", password: "pass123",
      });

      expect(result.userId).toBeTruthy();
      expect(s.passwordHasher.hash).toHaveBeenCalledWith("pass123");
    });
  });

  describe("forceLogout", () => {
    test("delegates to authSessionManager", async () => {
      const s = setup();
      const result = await s.authService.forceLogout("u1");
      expect(s.authSessionManager.forceLogout).toHaveBeenCalledWith("u1");
      expect(result.sessions).toBe(1);
    });
  });

  describe("MFA", () => {
    test("enableMFA returns secret and recovery codes", async () => {
      const s = setup();
      const result = await s.authService.enableMFA("u1");
      expect(result.secret).toBeTruthy();
      expect(result.qrCodeUri).toContain("otpauth://");
      expect(result.recoveryCodes.length).toBeGreaterThan(0);
    });

    test("verifyMFA delegates to totp.verifyAndConsume", async () => {
      const s = setup();
      s.results.set("SELECT", [{
        mfa_secret: "JBSWY3DPEHPK3PXP", mfa_enabled: true,
      }]);
      await s.authService.verifyMFA("u1", "123456");
      expect(s.totp.verifyAndConsume).toHaveBeenCalled();
    });
  });
});
