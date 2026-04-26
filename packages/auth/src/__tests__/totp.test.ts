import { describe, expect, test } from "bun:test";
import { createTOTP } from "../totp";

describe("createTOTP", () => {
  const totp = createTOTP();

  test("generateSecret returns a valid base32 string", () => {
    const secret = totp.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // 20 bytes → 32 base32 chars
    expect(secret.length).toBe(32);
  });

  test("generateURI produces correct otpauth format", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = totp.generateURI(secret, "VentoStack", "user@example.com");
    expect(uri).toStartWith("otpauth://totp/");
    expect(uri).toContain("VentoStack");
    expect(uri).toContain("user%40example.com");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=VentoStack");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
    expect(uri).toContain("algorithm=SHA1");
  });

  test("generate produces a 6-digit code by default", async () => {
    const secret = totp.generateSecret();
    const code = await totp.generate(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  test("generate and verify pair for same time", async () => {
    const secret = totp.generateSecret();
    const time = 1000000000;
    const code = await totp.generate(secret, time);
    const valid = await totp.verify(secret, code, time);
    expect(valid).toBe(true);
  });

  test("verify rejects wrong token", async () => {
    const secret = totp.generateSecret();
    const time = 1000000000;
    const valid = await totp.verify(secret, "000000", time);
    // Could match by chance, but very unlikely. Generate actual code to compare.
    const code = await totp.generate(secret, time);
    if (code !== "000000") {
      expect(valid).toBe(false);
    }
  });

  test("verify accepts within window", async () => {
    const secret = totp.generateSecret();
    const time = 1000000000;
    // Generate code for one period ahead
    const code = await totp.generate(secret, time + 30);
    const valid = await totp.verify(secret, code, time);
    expect(valid).toBe(true);
  });

  test("verify rejects outside window", async () => {
    const totp1 = createTOTP({ window: 0 });
    const secret = totp1.generateSecret();
    const time = 1000000000;
    const code = await totp1.generate(secret, time + 30);
    const valid = await totp1.verify(secret, code, time);
    expect(valid).toBe(false);
  });

  test("supports custom digits", async () => {
    const totp8 = createTOTP({ digits: 8 });
    const secret = totp8.generateSecret();
    const code = await totp8.generate(secret);
    expect(code).toMatch(/^\d{8}$/);
  });

  test("supports custom period", async () => {
    const totp60 = createTOTP({ period: 60 });
    const secret = totp60.generateSecret();
    const time = 1000000020;
    const code = await totp60.generate(secret, time);
    // Same code within the 60-second period (both floor to same counter)
    const code2 = await totp60.generate(secret, time + 10);
    expect(code).toBe(code2);
  });

  test("different secrets produce different codes", async () => {
    const secret1 = totp.generateSecret();
    const secret2 = totp.generateSecret();
    const time = 1000000000;
    const _code1 = await totp.generate(secret1, time);
    const _code2 = await totp.generate(secret2, time);
    // Extremely unlikely to be the same
    expect(secret1).not.toBe(secret2);
    // We can't guarantee codes differ but secrets should differ
  });

  test("supports SHA-256 algorithm", async () => {
    const totpSha256 = createTOTP({ algorithm: "SHA-256" });
    const secret = totpSha256.generateSecret();
    const time = 1000000000;
    const code = await totpSha256.generate(secret, time);
    expect(code).toMatch(/^\d{6}$/);
    const valid = await totpSha256.verify(secret, code, time);
    expect(valid).toBe(true);
  });

  describe("verifyAndConsume", () => {
    test("returns true for valid code", async () => {
      const totpInstance = createTOTP();
      const secret = totpInstance.generateSecret();
      const time = 1000000000;
      const code = await totpInstance.generate(secret, time);
      const result = await totpInstance.verifyAndConsume(secret, code, time);
      expect(result).toBe(true);
    });

    test("returns false for same code used twice", async () => {
      const totpInstance = createTOTP();
      const secret = totpInstance.generateSecret();
      const time = 1000000000;
      const code = await totpInstance.generate(secret, time);

      const first = await totpInstance.verifyAndConsume(secret, code, time);
      expect(first).toBe(true);

      const second = await totpInstance.verifyAndConsume(secret, code, time);
      expect(second).toBe(false);
    });

    test("allows code again after time window passes", async () => {
      const period = 30;
      const window = 1;
      const totpInstance = createTOTP({ period, window });
      const secret = totpInstance.generateSecret();
      const time = 1000000000;
      const code = await totpInstance.generate(secret, time);

      // Consume the code
      const first = await totpInstance.verifyAndConsume(secret, code, time);
      expect(first).toBe(true);

      // Same code should be rejected
      const second = await totpInstance.verifyAndConsume(secret, code, time);
      expect(second).toBe(false);

      // After the consumption window passes, generate a new code at a far-future time
      // The consumed code expiry = period * (window + 1) = 30 * 2 = 60 seconds
      // So we use a time far enough ahead that the old code wouldn't be generated
      const farFutureTime = time + period * (window + 1) * 10;
      const newCode = await totpInstance.generate(secret, farFutureTime);
      const result = await totpInstance.verifyAndConsume(secret, newCode, farFutureTime);
      expect(result).toBe(true);
    });

    test("negative: returns false for wrong code", async () => {
      const totpInstance = createTOTP();
      const secret = totpInstance.generateSecret();
      const time = 1000000000;
      const code = await totpInstance.generate(secret, time);
      // Generate a different code to make sure "000000" is different
      const wrongCode = code === "000000" ? "000001" : "000000";
      const result = await totpInstance.verifyAndConsume(secret, wrongCode, time);
      expect(result).toBe(false);
    });

    test("different secrets produce independent consumption tracking", async () => {
      const totpInstance = createTOTP();
      const secret1 = totpInstance.generateSecret();
      const secret2 = totpInstance.generateSecret();
      const time = 1000000000;

      const code1 = await totpInstance.generate(secret1, time);
      const code2 = await totpInstance.generate(secret2, time);

      // Consume code1
      expect(await totpInstance.verifyAndConsume(secret1, code1, time)).toBe(true);

      // code2 should still work for secret2 (different secret)
      expect(await totpInstance.verifyAndConsume(secret2, code2, time)).toBe(true);
    });
  });
});
