// @ventostack/core - 12-Factor 配置驱动

/** 12-Factor 配置结构 */
export interface TwelveFactorConfig {
  /** 应用名称 */
  appName: string;
  /** 应用端口 */
  port: number;
  /** 环境 */
  env: string;
  /** 日志级别 */
  logLevel: string;
  /** 数据库 URL */
  databaseUrl?: string;
  /** Redis URL */
  redisUrl?: string;
  /** 额外环境变量 */
  extra: Record<string, string>;
}

/** 12-Factor 配置加载结果 */
export interface TwelveFactorResult {
  /** 解析后的配置 */
  config: TwelveFactorConfig;
  /** 警告信息列表 */
  warnings: string[];
}

/**
 * 从环境变量加载 12-Factor 标准配置
 * 遵循 12-Factor App 的配置规范：所有配置从环境变量读取
 * @param env - 环境变量对象，默认 process.env
 * @returns 配置与警告信息
 */
export function loadTwelveFactorConfig(
  env?: Record<string, string | undefined>,
): TwelveFactorResult {
  const e = env ?? (typeof process !== "undefined" ? process.env : {});
  const warnings: string[] = [];

  const port = Number.parseInt(e.PORT ?? "3000", 10);
  if (Number.isNaN(port)) {
    warnings.push("PORT is not a valid number, defaulting to 3000");
  }

  const appEnv = e.NODE_ENV ?? e.BUN_ENV ?? "development";
  if (!["development", "test", "staging", "production"].includes(appEnv)) {
    warnings.push(`Unknown environment: ${appEnv}`);
  }

  if (!e.DATABASE_URL && appEnv === "production") {
    warnings.push("DATABASE_URL not set in production");
  }

  // 收集所有 APP_ 前缀的环境变量
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(e)) {
    if (key.startsWith("APP_") && value !== undefined) {
      extra[key] = value;
    }
  }

  const config: TwelveFactorConfig = {
    appName: e.APP_NAME ?? "ventostack-app",
    port: Number.isNaN(port) ? 3000 : port,
    env: appEnv,
    logLevel: e.LOG_LEVEL ?? "info",
    extra,
  };
  if (e.DATABASE_URL) config.databaseUrl = e.DATABASE_URL;
  if (e.REDIS_URL) config.redisUrl = e.REDIS_URL;

  return { config, warnings };
}

/**
 * 验证必要的环境变量是否已设置
 * @param required - 必需的环境变量名列表
 * @param env - 环境变量对象，默认 process.env
 * @returns 验证结果
 */
export function validateEnvVars(
  required: string[],
  env?: Record<string, string | undefined>,
): { valid: boolean; missing: string[] } {
  const e = env ?? (typeof process !== "undefined" ? process.env : {});
  const missing = required.filter((key) => !e[key]);
  return { valid: missing.length === 0, missing };
}
