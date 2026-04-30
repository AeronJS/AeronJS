/**
 * @ventostack/observability - 错误上报（Sentry / 钉钉告警 / Webhook）
 * 提供多通道错误上报能力，支持采样率控制、忽略模式与环境/服务标识
 * 内置 Sentry、钉钉 Webhook、通用 Webhook 三种告警通道
 */

export interface ErrorReporterConfig {
  /** 上报通道 */
  channels: ErrorChannel[];
  /** 采样率 0-1 */
  sampleRate?: number;
  /** 忽略的错误模式 */
  ignorePatterns?: RegExp[];
  /** 环境标识 */
  environment?: string;
  /** 服务名称 */
  serviceName?: string;
}

export interface ErrorChannel {
  name: string;
  report(error: ErrorReport): Promise<void>;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  level: "error" | "warning" | "fatal";
  timestamp: number;
  context?: Record<string, unknown>;
  environment?: string;
  serviceName?: string;
}

export interface ErrorReporter {
  capture(
    error: Error | string,
    context?: Record<string, unknown>,
    level?: ErrorReport["level"],
  ): Promise<void>;
  captureWarning(message: string, context?: Record<string, unknown>): Promise<void>;
  captureFatal(error: Error | string, context?: Record<string, unknown>): Promise<void>;
}

/**
 * 创建错误上报器
 */
export function createErrorReporter(config: ErrorReporterConfig): ErrorReporter {
  const sampleRate = config.sampleRate ?? 1.0;

  function shouldReport(): boolean {
    return Math.random() < sampleRate;
  }

  function isIgnored(message: string): boolean {
    return config.ignorePatterns?.some((p) => p.test(message)) ?? false;
  }

  async function report(
    error: Error | string,
    context?: Record<string, unknown>,
    level: ErrorReport["level"] = "error",
  ): Promise<void> {
    if (!shouldReport()) return;

    const message = error instanceof Error ? error.message : error;
    if (isIgnored(message)) return;

    const report: ErrorReport = {
      message,
      level,
      timestamp: Date.now(),
    };
    if (error instanceof Error && error.stack) report.stack = error.stack;
    if (context) report.context = context;
    if (config.environment) report.environment = config.environment;
    if (config.serviceName) report.serviceName = config.serviceName;

    await Promise.allSettled(config.channels.map((ch) => ch.report(report)));
  }

  return {
    async capture(error, context, level) {
      await report(error, context, level ?? "error");
    },
    async captureWarning(message, context) {
      await report(message, context, "warning");
    },
    async captureFatal(error, context) {
      await report(error, context, "fatal");
    },
  };
}

/**
 * 创建 Sentry 通道
 */
export function createSentryChannel(dsn: string): ErrorChannel {
  return {
    name: "sentry",
    async report(error) {
      // 简化的 Sentry 上报（实际应使用 Sentry SDK envelope 格式）
      await fetch(dsn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: crypto.randomUUID().replace(/-/g, ""),
          timestamp: error.timestamp / 1000,
          level: error.level,
          message: { formatted: error.message },
          exception: error.stack
            ? { values: [{ type: "Error", value: error.message, stacktrace: { frames: [] } }] }
            : undefined,
          environment: error.environment,
          server_name: error.serviceName,
          extra: error.context,
        }),
      });
    },
  };
}

/**
 * 创建钉钉 Webhook 通道
 */
export function createDingTalkChannel(webhookUrl: string): ErrorChannel {
  return {
    name: "dingtalk",
    async report(error) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: {
            title: `[${error.level.toUpperCase()}] ${error.serviceName ?? "unknown"}`,
            text: [
              `### ${error.level === "fatal" ? "🔴" : error.level === "error" ? "🟠" : "🟡"} ${error.level.toUpperCase()}`,
              `**Service**: ${error.serviceName ?? "unknown"}`,
              `**Env**: ${error.environment ?? "unknown"}`,
              `**Time**: ${new Date(error.timestamp).toISOString()}`,
              `**Message**: ${error.message}`,
              error.stack ? `\`\`\`\n${error.stack.slice(0, 500)}\n\`\`\`` : "",
            ].join("\n\n"),
          },
        }),
      });
    },
  };
}

/**
 * 创建通用 Webhook 通道
 */
export function createWebhookChannel(url: string, headers?: Record<string, string>): ErrorChannel {
  return {
    name: "webhook",
    async report(error) {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(error),
      });
    },
  };
}
