/**
 * @ventostack/observability — Health Check
 * 提供存活探针（live）与就绪探针（ready），支持并行执行多项自定义检查
 * 自动聚合检查结果为 ok / degraded / error 三种整体状态，并计算服务运行时长
 */

/** 单项健康检查结果 */
export interface CheckResult {
  /** 检查状态：ok 为正常，error 为异常 */
  status: "ok" | "error";
  /** 异常时的描述信息 */
  message?: string;
  /** 检查耗时，单位毫秒 */
  duration?: number;
}

/** 整体健康状态 */
export interface HealthStatus {
  /** 聚合状态：ok 全部正常，degraded 部分异常，error 全部异常 */
  status: "ok" | "degraded" | "error";
  /** 各检查项的结果映射 */
  checks: Record<string, CheckResult>;
  /** 服务运行时长，单位毫秒 */
  uptime: number;
}

/** 健康检查器接口 */
export interface HealthCheck {
  /** 注册一项健康检查
   * @param name 检查项名称
   * @param checker 异步检查函数，返回 true 表示正常，返回字符串表示异常原因 */
  addCheck(name: string, checker: () => Promise<boolean | string>): void;
  /** 存活探针，简单返回 ok */
  live(): { status: "ok" };
  /** 就绪探针，并行执行所有注册的检查项
   * @returns 聚合健康状态 */
  ready(): Promise<HealthStatus>;
}

/** 健康检查配置选项 */
export interface HealthCheckOptions {
  /** 服务启动时间戳，用于计算 uptime，默认取当前时间 */
  startTime?: number;
}

/** 创建健康检查器
 * @param options 可选配置
 * @returns HealthCheck 实例 */
export function createHealthCheck(options?: HealthCheckOptions): HealthCheck {
  const startTime = options?.startTime ?? Date.now();
  const checks = new Map<string, () => Promise<boolean | string>>();

  function addCheck(name: string, checker: () => Promise<boolean | string>): void {
    checks.set(name, checker);
  }

  function live(): { status: "ok" } {
    return { status: "ok" };
  }

  async function ready(): Promise<HealthStatus> {
    const results: Record<string, CheckResult> = {};
    let okCount = 0;
    let totalCount = 0;

    const entries = Array.from(checks.entries());

    await Promise.all(
      entries.map(async ([name, checker]) => {
        totalCount++;
        const start = performance.now();
        try {
          const result = await checker();
          const duration = Math.round((performance.now() - start) * 100) / 100;
          if (result === true) {
            results[name] = { status: "ok", duration };
            okCount++;
          } else {
            results[name] = { status: "error", message: result as string, duration };
          }
        } catch (err) {
          const duration = Math.round((performance.now() - start) * 100) / 100;
          results[name] = {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
            duration,
          };
        }
      }),
    );

    let status: HealthStatus["status"];
    if (totalCount === 0) {
      status = "ok";
    } else if (okCount === totalCount) {
      status = "ok";
    } else if (okCount === 0) {
      status = "error";
    } else {
      status = "degraded";
    }

    return {
      status,
      checks: results,
      uptime: Date.now() - startTime,
    };
  }

  return { addCheck, live, ready };
}
