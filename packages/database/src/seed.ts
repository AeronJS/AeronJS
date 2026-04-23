/**
 * @ventostack/database — Seed 数据填充
 * 提供可排序、可按名称筛选的种子数据运行器，用于初始化测试或演示数据
 */

import type { SqlExecutor } from "./database";

/**
 * 单个种子定义。
 */
export interface Seed {
  /** 种子名称（唯一标识） */
  name: string;
  /**
   * 执行种子填充。
   * @param executor — SQL 执行器
   */
  run: (executor: SqlExecutor) => Promise<void>;
}

/**
 * 种子运行器接口。
 */
export interface SeedRunner {
  /**
   * 注册种子。
   * @param seed — 种子定义
   */
  addSeed(seed: Seed): void;
  /**
   * 运行种子。
   * @param options.only — 仅运行指定名称的种子
   * @returns 实际执行的种子名称列表
   */
  run(options?: { only?: string[] }): Promise<string[]>;
  /** 获取已注册的所有种子名称 */
  list(): string[];
}

/**
 * 创建种子运行器。
 * @param executor — SQL 执行器
 * @returns SeedRunner 实例
 */
export function createSeedRunner(executor: SqlExecutor): SeedRunner {
  const seeds: Seed[] = [];

  return {
    addSeed(seed) {
      seeds.push(seed);
    },

    async run(options) {
      const toRun = options?.only ? seeds.filter((s) => options.only!.includes(s.name)) : seeds;

      const sorted = [...toRun].sort((a, b) => a.name.localeCompare(b.name));
      const executed: string[] = [];

      for (const seed of sorted) {
        await seed.run(executor);
        executed.push(seed.name);
      }

      return executed;
    },

    list() {
      return seeds.map((s) => s.name);
    },
  };
}
