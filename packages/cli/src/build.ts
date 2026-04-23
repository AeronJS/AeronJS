#!/usr/bin/env bun
/**
 * VentoStack monorepo 构建脚本
 *
 * 遍历所有 packages 子包，使用 bun build 将其 src/index.ts 编译到 dist 目录。
 * 构建失败时输出错误信息并在最后以非零状态码退出。
 */

import { $ } from "bun";

/** 需要构建的包名列表 */
const PACKAGES = [
  "core",
  "database",
  "cache",
  "auth",
  "events",
  "observability",
  "openapi",
  "testing",
  "ai",
  "cli",
];

/** 仓库根目录绝对路径 */
const ROOT = new URL("../../..", import.meta.url).pathname;

console.log("Building VentoStack packages...\n");

/** 构建失败的包数量 */
let failed = 0;

for (const pkg of PACKAGES) {
  const pkgDir = `${ROOT}packages/${pkg}`;
  process.stdout.write(`  Building @ventostack/${pkg}... `);

  const result = await $`bun build --target=bun --outdir=${pkgDir}/dist ${pkgDir}/src/index.ts`
    .quiet()
    .nothrow();

  if (result.exitCode === 0) {
    console.log("done");
  } else {
    console.log("FAILED");
    console.error(result.stderr.toString());
    failed++;
  }
}

console.log(`\nBuild complete. ${PACKAGES.length - failed}/${PACKAGES.length} packages succeeded.`);

if (failed > 0) {
  process.exit(1);
}
