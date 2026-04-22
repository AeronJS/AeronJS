/**
 * @aeron/ai — 权限沙箱
 *
 * 提供 AI 工具执行前的权限校验能力，包括工具白名单、网络访问控制、文件访问控制和超时限制。
 */

import { resolve } from "node:path";

/** 沙箱权限配置 */
export interface SandboxPermissions {
  /** 允许执行的工具名称列表，为空表示允许所有 */
  allowedTools?: string[];
  /** 允许访问的主机列表；开启网络访问时必须显式提供 */
  allowedHosts?: string[];
  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number;
  /** 最大内存限制（字节） */
  maxMemory?: number;
  /** 是否允许文件读取 */
  allowFileRead?: boolean;
  /** 是否允许文件写入 */
  allowFileWrite?: boolean;
  /** 是否允许网络访问 */
  allowNetworkAccess?: boolean;
  /** 允许读写的工作目录；开启文件访问时必须显式提供 */
  workingDirectory?: string;
}

/** 沙箱实例，用于校验工具执行、网络访问和文件访问权限 */
export interface Sandbox {
  /**
   * 检查是否允许执行指定工具
   * @param toolName - 工具名称
   * @returns 是否允许
   */
  canExecute(toolName: string): boolean;

  /**
   * 检查是否允许访问指定 URL
   * @param url - 目标 URL
   * @returns 是否允许
   */
  canAccessURL(url: string): boolean;

  /**
   * 检查是否允许访问指定文件路径
   * @param filePath - 文件路径
   * @param mode - 访问模式（read 或 write）
   * @returns 是否允许
   */
  canAccessPath(filePath: string, mode: "read" | "write"): boolean;

  /**
   * 包装工具执行，增加超时控制
   * @param toolName - 工具名称
   * @param fn - 实际执行的异步函数
   * @returns 执行结果
   */
  wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T>;

  /** 获取当前生效的权限配置副本 */
  getPermissions(): SandboxPermissions;
}

/** 默认最大执行时间：60 秒（毫秒） */
const DEFAULT_MAX_EXECUTION_TIME = 60_000;
/** 默认最大内存限制：50 MB（字节） */
const DEFAULT_MAX_MEMORY = 50 * 1024 * 1024;

/**
 * 创建沙箱实例
 * @param permissions - 沙箱权限配置
 * @returns Sandbox 实例
 */
export function createSandbox(permissions: SandboxPermissions): Sandbox {
  const effectivePermissions: SandboxPermissions = {
    allowFileRead: false,
    allowFileWrite: false,
    allowNetworkAccess: false,
    maxExecutionTime: DEFAULT_MAX_EXECUTION_TIME,
    maxMemory: DEFAULT_MAX_MEMORY,
    ...permissions,
  };

  function canExecute(toolName: string): boolean {
    if (!effectivePermissions.allowedTools || effectivePermissions.allowedTools.length === 0) {
      return true;
    }
    return effectivePermissions.allowedTools.includes(toolName);
  }

  function canAccessURL(url: string): boolean {
    if (!effectivePermissions.allowNetworkAccess) {
      return false;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    // Only allow http/https schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!effectivePermissions.allowedHosts || effectivePermissions.allowedHosts.length === 0) {
      return false;
    }
    return effectivePermissions.allowedHosts.includes(parsed.hostname);
  }

  function canAccessPath(filePath: string, mode: "read" | "write"): boolean {
    if (mode === "read" && !effectivePermissions.allowFileRead) {
      return false;
    }
    if (mode === "write" && !effectivePermissions.allowFileWrite) {
      return false;
    }
    if (!effectivePermissions.workingDirectory) {
      return false;
    }
    const resolved = resolve(filePath);
    const workDir = resolve(effectivePermissions.workingDirectory);
    return resolved.startsWith(`${workDir}/`) || resolved === workDir;
  }

  async function wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    if (!canExecute(toolName)) {
      throw new Error(`Permission denied: tool "${toolName}" is not allowed`);
    }

    const timeout = effectivePermissions.maxExecutionTime ?? DEFAULT_MAX_EXECUTION_TIME;

    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Sandbox execution timed out after ${timeout}ms`)),
          timeout,
        ),
      ),
    ]);
  }

  function getPermissions(): SandboxPermissions {
    return { ...effectivePermissions };
  }

  return {
    canExecute,
    canAccessURL,
    canAccessPath,
    wrapExecution,
    getPermissions,
  };
}
