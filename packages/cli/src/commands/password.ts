/**
 * @ventostack/cli — Password Command
 *
 * 提供基于 Bun.password 的密码哈希命令，用于生成安全的密码哈希字符串。
 */

import type { Command } from "../cli";

/**
 * 创建 password 命令
 * @returns password 命令实例
 */
export function createPasswordCommand(): Command {
  return {
    name: "password",
    description: "Hash a password using Bun.password",
    action: async (args: Record<string, unknown>) => {
      const positional = (args._ as string[] | undefined) ?? [];
      const plaintext = positional[0];

      if (!plaintext) {
        console.error("Usage: ventostack password <plaintext>");
        return;
      }

      const hash = await Bun.password.hash(plaintext);
      console.log(hash);
    },
  };
}
