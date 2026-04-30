// @ventostack/core - 熔断器

/** 熔断器状态 */
export type CircuitState = "closed" | "open" | "half-open";

/** 熔断器配置选项 */
export interface CircuitBreakerOptions {
  /** 失败阈值，默认 5 */
  failureThreshold?: number;
  /** 熔断后重置超时（毫秒），默认 30000 */
  resetTimeout?: number;
  /** 半开状态最大尝试次数，默认 1 */
  halfOpenMax?: number;
  /** 状态变更回调 */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/** 熔断器接口 */
export interface CircuitBreaker {
  /**
   * 执行受保护函数
   * @param fn - 异步函数
   * @returns 函数返回值
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;
  /** 获取当前状态 */
  getState(): CircuitState;
  /** 获取统计信息 */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailure?: number;
  };
  /** 重置熔断器 */
  reset(): void;
}

/**
 * 创建熔断器打开错误
 * @returns Error 实例
 */
export function createCircuitOpenError(): Error {
  const error = new Error("Circuit breaker is open");
  error.name = "CircuitOpenError";
  return error;
}

/**
 * 创建熔断器
 * @param options - 熔断器配置选项
 * @returns CircuitBreaker 实例
 */
export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  const failureThreshold = options?.failureThreshold ?? 5;
  const resetTimeout = options?.resetTimeout ?? 30_000;
  const halfOpenMax = options?.halfOpenMax ?? 1;
  const onStateChange = options?.onStateChange;

  let state: CircuitState = "closed";
  let failures = 0;
  let successes = 0;
  let lastFailure: number | undefined;
  let halfOpenAttempts = 0;
  let openedAt: number | undefined;

  function transition(to: CircuitState): void {
    if (state === to) return;
    const from = state;
    state = to;
    if (to === "closed") {
      failures = 0;
      halfOpenAttempts = 0;
      openedAt = undefined;
    }
    if (to === "open") {
      openedAt = Date.now();
      halfOpenAttempts = 0;
    }
    if (to === "half-open") {
      halfOpenAttempts = 0;
    }
    onStateChange?.(from, to);
  }

  function checkOpenTimeout(): void {
    if (state === "open" && openedAt !== undefined) {
      if (Date.now() - openedAt >= resetTimeout) {
        transition("half-open");
      }
    }
  }

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      checkOpenTimeout();

      if (state === "open") {
        throw createCircuitOpenError();
      }

      if (state === "half-open" && halfOpenAttempts >= halfOpenMax) {
        throw createCircuitOpenError();
      }

      if (state === "half-open") {
        halfOpenAttempts++;
      }

      try {
        const result = await fn();
        successes++;
        if (state === "half-open") {
          transition("closed");
        }
        return result;
      } catch (error) {
        failures++;
        lastFailure = Date.now();

        if (state === "half-open") {
          transition("open");
        } else if (state === "closed" && failures >= failureThreshold) {
          transition("open");
        }

        throw error;
      }
    },

    getState(): CircuitState {
      checkOpenTimeout();
      return state;
    },

    getStats() {
      checkOpenTimeout();
      const stats: {
        state: CircuitState;
        failures: number;
        successes: number;
        lastFailure?: number;
      } = {
        state,
        failures,
        successes,
      };
      if (lastFailure !== undefined) {
        stats.lastFailure = lastFailure;
      }
      return stats;
    },

    reset(): void {
      transition("closed");
      successes = 0;
      lastFailure = undefined;
    },
  };
}
