/**
 * @ventostack/auth - TOTP 双因素认证 (RFC 6238)
 * 基于 Web Crypto API HMAC 实现，支持密钥生成、URI 生成、验证码生成与校验
 * 兼容 Google Authenticator 等标准 TOTP 客户端
 */

/**
 * TOTP 管理器配置选项
 */
export interface TOTPOptions {
  /** 验证码位数，默认 6 */
  digits?: number;
  /** 时间步长（秒），默认 30 */
  period?: number;
  /** 哈希算法，默认 SHA-1（兼容性最佳） */
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512";
  /** 时间窗口容差（前后各多少个时间窗口），默认 1 */
  window?: number;
}

/**
 * TOTP 管理器接口
 * 提供密钥生成、URI 生成、验证码生成与校验能力
 */
export interface TOTPManager {
  /**
   * 生成随机 Base32 编码的密钥
   * @returns Base32 密钥字符串
   */
  generateSecret(): string;

  /**
   * 生成 otpauth:// URI（用于二维码扫描）
   * @param secret Base32 密钥
   * @param issuer 服务名称/发行方
   * @param account 用户账号
   * @returns otpauth URI 字符串
   */
  generateURI(secret: string, issuer: string, account: string): string;

  /**
   * 生成当前时间步的 TOTP 验证码
   * @param secret Base32 密钥
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 数字验证码字符串
   */
  generate(secret: string, time?: number): Promise<string>;

  /**
   * 校验 TOTP 验证码
   * @param secret Base32 密钥
   * @param token 用户输入的验证码
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 校验通过返回 true，否则返回 false
   */
  verify(secret: string, token: string, time?: number): Promise<boolean>;
}

// Base32 (RFC 4648) A-Z2-7
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * 将字节数组编码为 Base32 字符串（RFC 4648）
 * @param data 字节数组
 * @returns Base32 编码字符串
 */
function base32Encode(data: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * 将 Base32 字符串解码为字节数组（RFC 4648）
 * @param encoded Base32 编码字符串
 * @returns 字节数组
 */
function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(output);
}

/** 算法名称映射表（Web Crypto API 兼容） */
const ALGORITHM_MAP: Record<string, string> = {
  "SHA-1": "SHA-1",
  "SHA-256": "SHA-256",
  "SHA-512": "SHA-512",
};

/**
 * 创建 TOTP 管理器实例
 * 基于 RFC 6238（TOTP）和 RFC 4226（HOTP）实现
 * @param options TOTP 配置选项
 * @returns TOTP 管理器实例
 */
export function createTOTP(options: TOTPOptions = {}): TOTPManager {
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const algorithm = options.algorithm ?? "SHA-1";
  const window = options.window ?? 1;

  /**
   * 使用 HMAC-SHA 对数据签名
   * @param secret 密钥字节数组
   * @param data 待签名数据字节数组
   * @returns 签名结果字节数组
   */
  async function hmacSign(secret: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
      "raw",
      secret as unknown as Uint8Array<ArrayBuffer>,
      { name: "HMAC", hash: ALGORITHM_MAP[algorithm]! },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, data as unknown as Uint8Array<ArrayBuffer>);
    return new Uint8Array(sig);
  }

  /**
   * 将整数编码为大端序 8 字节数组
   * @param num 整数
   * @returns 大端序 8 字节数组
   */
  function intToBytes(num: number): Uint8Array {
    const bytes = new Uint8Array(8);
    // Big-endian 8-byte encoding
    let n = num;
    for (let i = 7; i >= 0; i--) {
      bytes[i] = n & 0xff;
      n = Math.floor(n / 256);
    }
    return bytes;
  }

  /**
   * 生成一次性密码（OTP）
   * @param secret 密钥字节数组
   * @param counter 时间计数器
   * @returns 数字验证码字符串
   */
  async function generateOTP(secret: Uint8Array, counter: number): Promise<string> {
    const counterBytes = intToBytes(counter);
    const hash = await hmacSign(secret, counterBytes);

    // Dynamic truncation (RFC 4226)
    const offset = hash[hash.length - 1]! & 0x0f;
    const code =
      ((hash[offset]! & 0x7f) << 24) |
      ((hash[offset + 1]! & 0xff) << 16) |
      ((hash[offset + 2]! & 0xff) << 8) |
      (hash[offset + 3]! & 0xff);

    const otp = code % 10 ** digits;
    return otp.toString().padStart(digits, "0");
  }

  return {
    generateSecret(): string {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      return base32Encode(bytes);
    },

    generateURI(secret: string, issuer: string, account: string): string {
      const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
      const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: algorithm.replace("-", ""),
        digits: digits.toString(),
        period: period.toString(),
      });
      return `otpauth://totp/${label}?${params.toString()}`;
    },

    async generate(secret: string, time?: number): Promise<string> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);
      return generateOTP(secretBytes, counter);
    },

    async verify(secret: string, token: string, time?: number): Promise<boolean> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);

      for (let i = -window; i <= window; i++) {
        const otp = await generateOTP(secretBytes, counter + i);
        if (otp === token) {
          return true;
        }
      }

      return false;
    },
  };
}
