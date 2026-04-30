/**
 * @ventostack/cli — CLI 模块公共入口
 *
 * 提供 CLI 构建器、命令注册以及各类子命令的工厂函数。
 */

export { createCLI, run } from "./cli";
export type { CLI, Command, CommandOption } from "./cli";
export { createGenerateCommand } from "./commands/generate";
export type { GenerateOptions } from "./commands/generate";
export { createMigrateCommand } from "./commands/migrate";
export type { MigrateOptions } from "./commands/migrate";
export { createPasswordCommand } from "./commands/password";
