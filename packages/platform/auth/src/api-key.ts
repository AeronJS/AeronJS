/**
 * @ventostack/auth - API Key 管理
 * 提供 API Key 的生成、哈希与恒定时间校验能力
 * API Key 必须哈希后存储，不允许明文持久化；校验使用恒定时间比较防止时序攻击
 */

/**
 * API Key 管理器接口
 * 提供 API Key 的生成、哈希与校验能力
 */
export interface ApiKeyManager {
  /**
   * 生成新的 API Key 及其哈希值
   * @param metadata 可选的元数据（如租户、用途、创建者）
   * @returns 包含明文 key、哈希值和元数据的对象
   */
  generate(metadata?: Record<string, unknown>): Promise<{
    /** 明文 API Key（仅生成时返回一次，需妥善保存） */
    key: string;
    /** API Key 的 SHA-256 哈希值（用于持久化存储） */
    hash: string;
    /** 可选的元数据 */
    metadata?: Record<string, unknown>;
  }>;

  /**
   * 对 API Key 进行哈希
   * @param key 明文 API Key
   * @returns SHA-256 哈希值
   */
  hash(key: string): Promise<string>;

  /**
   * 校验 API Key 是否与存储的哈希匹配
   * @param key 明文 API Key
   * @param storedHash 存储的哈希值
   * @returns 匹配返回 true，否则返回 false
   */
  verify(key: string, storedHash: string): Promise<boolean>;
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 * @param bytes 字节数组
 * @returns 十六进制字符串
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * 使用 Web Crypto API 对输入进行 SHA-256 哈希
 * @param input 输入字符串
 * @returns 十六进制形式的哈希值
 */
async function sha256Hash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return uint8ArrayToHex(new Uint8Array(hashBuffer));
}

/**
 * 恒定时间字符串比较，防止时序攻击
 * 使用 HMAC 对两个字符串签名后按位比较
 * @param a 待比较的字符串 a
 * @param b 待比较的字符串 b
 * @returns 相等返回 true，否则返回 false
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) return false;

  // Use HMAC with a fixed key for constant-time comparison
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32), // fixed zero key, just for comparison
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigA = await crypto.subtle.sign("HMAC", key, aBytes);
  const sigB = await crypto.subtle.sign("HMAC", key, bBytes);

  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);

  // Both HMAC results are always same length
  let result = 0;
  for (let i = 0; i < viewA.length; i++) {
    result |= viewA[i]! ^ viewB[i]!;
  }
  return result === 0;
}

/**
 * 生成 4 字节随机前缀（十六进制）
 * @returns 8 位十六进制字符串前缀
 */
function generatePrefix(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return uint8ArrayToHex(bytes);
}

/**
 * 创建 API Key 管理器实例
 * 生成的 Key 格式为：ak_{prefix}_{uuid}
 * 哈希使用 SHA-256，校验使用恒定时间比较防止时序攻击
 * @returns API Key 管理器实例
 */
export function createApiKeyManager(): ApiKeyManager {
  return {
    async generate(metadata?: Record<string, unknown>): Promise<{
      key: string;
      hash: string;
      metadata?: Record<string, unknown>;
    }> {
      const prefix = generatePrefix();
      const uuid = crypto.randomUUID();
      const key = `ak_${prefix}_${uuid}`;
      const hash = await sha256Hash(key);

      return {
        key,
        hash,
        ...(metadata ? { metadata } : {}),
      };
    },

    async hash(key: string): Promise<string> {
      return sha256Hash(key);
    },

    async verify(key: string, storedHash: string): Promise<boolean> {
      const keyHash = await sha256Hash(key);
      return constantTimeEqual(keyHash, storedHash);
    },
  };
}
