// @aeron/core - 敏感配置加密存储

/** 配置加密器选项 */
export interface ConfigEncryptionOptions {
  /** 加密密钥（UTF-8 编码后必须恰好为 32 字节） */
  key: string;
  /** 加密算法 */
  algorithm?: string;
}

/** 配置加密器接口 */
export interface ConfigEncryptor {
  /**
   * 加密字符串
   * @param value - 明文
   * @returns 密文（带 ENC: 前缀）
   */
  encrypt(value: string): Promise<string>;
  /**
   * 解密字符串
   * @param encrypted - 密文（带 ENC: 前缀）
   * @returns 明文
   */
  decrypt(encrypted: string): Promise<string>;
  /**
   * 判断字符串是否已加密
   * @param value - 待判断字符串
   * @returns 是否已加密
   */
  isEncrypted(value: string): boolean;
}

const ENCRYPTED_PREFIX = "ENC:";

/**
 * 创建配置加密器
 * 使用 AES-256-GCM 加密敏感配置值
 * @param options - 加密器选项
 * @returns ConfigEncryptor 实例
 */
export function createConfigEncryptor(options: ConfigEncryptionOptions): ConfigEncryptor {
  const keyBytes = new TextEncoder().encode(options.key);

  if (keyBytes.byteLength !== 32) {
    throw new Error("Config encryption key must be exactly 32 bytes when UTF-8 encoded");
  }

  async function getKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }

  return {
    async encrypt(value: string): Promise<string> {
      const key = await getKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(value);
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      const b64 = btoa(String.fromCharCode(...combined));
      return `${ENCRYPTED_PREFIX}${b64}`;
    },

    async decrypt(encrypted: string): Promise<string> {
      if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
        throw new Error("Value is not encrypted");
      }
      const b64 = encrypted.slice(ENCRYPTED_PREFIX.length);
      const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const key = await getKey();
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return new TextDecoder().decode(decrypted);
    },

    isEncrypted(value: string): boolean {
      return value.startsWith(ENCRYPTED_PREFIX);
    },
  };
}
