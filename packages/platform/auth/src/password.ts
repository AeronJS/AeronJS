/**
 * @ventostack/auth - Password hashing with Bun.password
 * Uses bcrypt algorithm by default. Do NOT store plaintext passwords.
 */

/** 密码哈希器接口 */
export interface PasswordHasher {
  /**
   * 对明文密码进行哈希
   * @param password 明文密码
   * @returns 哈希后的密码字符串
   */
  hash(password: string): Promise<string>;

  /**
   * 验证明文密码与哈希是否匹配
   * @param password 明文密码
   * @param hash 存储的哈希值
   * @returns 匹配返回 true，否则返回 false
   */
  verify(password: string, hash: string): Promise<boolean>;
}

/** 密码哈希器配置选项 */
export interface PasswordHasherOptions {
  /** 哈希算法，目前仅支持 bcrypt */
  algorithm?: "bcrypt";
  /** bcrypt 成本因子，默认 10 */
  cost?: number;
}

/**
 * 创建密码哈希器实例
 * 基于 Bun.password 实现，默认使用 bcrypt 算法
 * @param options 哈希器配置选项
 * @returns 密码哈希器实例
 */
export function createPasswordHasher(options?: PasswordHasherOptions): PasswordHasher {
  const algorithm = options?.algorithm ?? "bcrypt";
  const cost = options?.cost ?? 10;

  if (algorithm !== "bcrypt") {
    throw new Error(`Unsupported password algorithm: ${algorithm}. Only "bcrypt" is supported.`);
  }

  return {
    async hash(password: string): Promise<string> {
      return Bun.password.hash(password, {
        algorithm: "bcrypt",
        cost,
      });
    },

    async verify(password: string, hash: string): Promise<boolean> {
      return Bun.password.verify(password, hash);
    },
  };
}
