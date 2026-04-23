/**
 * @ventostack/cli — Generate Command
 *
 * 提供代码脚手架生成功能，支持 controller、model、migration 三种类型。
 */

import type { Command } from "../cli";

/**
 * 生成 Controller 模板内容
 * @param name - 资源名称（首字母大写）
 * @returns Controller 文件内容字符串
 */
function controllerTemplate(name: string): string {
  return `// ${name} Controller
import type { Context } from "@ventostack/core";

export function create${name}Controller() {
  return {
    async index(ctx: Context): Promise<Response> {
      return ctx.json({ message: "List ${name}" });
    },

    async show(ctx: Context): Promise<Response> {
      const id = ctx.params.id;
      return ctx.json({ message: \`Show ${name} \${id}\` });
    },

    async create(ctx: Context): Promise<Response> {
      return ctx.json({ message: "Create ${name}" }, 201);
    },

    async update(ctx: Context): Promise<Response> {
      const id = ctx.params.id;
      return ctx.json({ message: \`Update ${name} \${id}\` });
    },

    async delete(ctx: Context): Promise<Response> {
      const id = ctx.params.id;
      return ctx.json({ message: \`Delete ${name} \${id}\` });
    },
  };
}
`;
}

/**
 * 生成 Model 模板内容
 * @param name - 资源名称（首字母大写）
 * @returns Model 文件内容字符串
 */
function modelTemplate(name: string): string {
  const tableName = `${name.toLowerCase()}s`;
  return `// ${name} Model
import { defineModel, column } from "@ventostack/database";

export const ${name}Model = defineModel("${tableName}", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 255 }),
  createdAt: column.timestamp(),
  updatedAt: column.timestamp(),
});
`;
}

/**
 * 生成 Migration 模板内容
 * @param name - 迁移名称
 * @param timestamp - 时间戳前缀
 * @returns Migration 文件内容字符串
 */
function migrationTemplate(name: string, timestamp: string): string {
  return `// Migration: ${name}
import type { Migration } from "@ventostack/database";

export const migration: Migration = {
  name: "${timestamp}_${name}",

  async up(executor) {
    await executor(\`
      -- Add your migration SQL here
    \`);
  },

  async down(executor) {
    await executor(\`
      -- Add your rollback SQL here
    \`);
  },
};
`;
}

/**
 * 生成时间戳字符串（YYYYMMDDHHMMSS 格式）
 * @returns 14 位时间戳字符串
 */
function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** Generate 命令选项 */
export interface GenerateOptions {
  /** 输出目录，默认当前工作目录 */
  outputDir?: string;
  /** 自定义时间戳生成函数 */
  timestampFn?: () => string;
}

/**
 * 创建 generate 命令
 * @param opts - 可选配置项
 * @returns generate 命令实例
 */
export function createGenerateCommand(opts?: GenerateOptions): Command {
  const outputDir = opts?.outputDir ?? process.cwd();
  const getTimestamp = opts?.timestampFn ?? generateTimestamp;

  return {
    name: "generate",
    description: "Generate code scaffolds (controller, model, migration)",
    action: async (args: Record<string, unknown>) => {
      const positional = (args._ as string[] | undefined) ?? [];
      const type = positional[0];
      const name = positional[1];

      if (!type || !name) {
        console.error("Usage: ventostack generate <type> <name>");
        console.error("Types: controller, model, migration");
        return;
      }

      switch (type) {
        case "controller": {
          const fileName = `${name.toLowerCase()}.controller.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = controllerTemplate(name);
          await Bun.write(filePath, content);
          console.log(`Generated controller: ${filePath}`);
          break;
        }
        case "model": {
          const fileName = `${name.toLowerCase()}.model.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = modelTemplate(name);
          await Bun.write(filePath, content);
          console.log(`Generated model: ${filePath}`);
          break;
        }
        case "migration": {
          const timestamp = getTimestamp();
          const fileName = `${timestamp}_${name}.ts`;
          const filePath = `${outputDir}/${fileName}`;
          const content = migrationTemplate(name, timestamp);
          await Bun.write(filePath, content);
          console.log(`Generated migration: ${filePath}`);
          break;
        }
        default:
          console.error(`Unknown type: ${type}`);
          console.error("Types: controller, model, migration");
      }
    },
  };
}
