/**
 * @ventostack/events - 分布式事务（Saga 编排）
 * 提供 Saga 与 TCC 两种分布式事务模式，支持正向执行、失败补偿与状态追踪
 * Saga 按顺序执行步骤，失败时逆序补偿；TCC 采用 Try-Confirm-Cancel 三阶段提交
 */

/** Saga 步骤定义 */
export interface SagaStep<T = unknown> {
  /** 步骤名称 */
  name: string;
  /** 正向执行函数
   * @param context 当前上下文
   * @returns 执行后的新上下文 */
  execute: (context: T) => Promise<T>;
  /** 补偿回滚函数
   * @param context 当前上下文
   * @returns 补偿后的新上下文 */
  compensate: (context: T) => Promise<T>;
}

/** Saga 执行状态 */
export type SagaStatus = "pending" | "running" | "completed" | "compensating" | "failed";

/** Saga 执行结果 */
export interface SagaResult<T> {
  /** 最终状态 */
  status: SagaStatus;
  /** 最终上下文 */
  context: T;
  /** 已完成的步骤名称列表 */
  completedSteps: string[];
  /** 失败步骤名称 */
  failedStep?: string;
  /** 错误描述 */
  error?: string;
}

/** Saga 编排器接口 */
export interface SagaOrchestrator<T> {
  /** 添加执行步骤
   * @param step Saga 步骤 */
  addStep(step: SagaStep<T>): void;
  /** 按顺序执行所有步骤，失败时逆序补偿
   * @param initialContext 初始上下文
   * @returns Saga 执行结果 */
  execute(initialContext: T): Promise<SagaResult<T>>;
  /** 获取已注册的所有步骤名称
   * @returns 步骤名称数组 */
  getSteps(): string[];
}

/**
 * 创建 Saga 编排器
 * 按顺序执行步骤，失败时按逆序补偿
 * @returns SagaOrchestrator 实例 */
export function createSaga<T>(): SagaOrchestrator<T> {
  const steps: SagaStep<T>[] = [];

  return {
    addStep(step: SagaStep<T>): void {
      steps.push(step);
    },

    async execute(initialContext: T): Promise<SagaResult<T>> {
      const completedSteps: string[] = [];
      let context = initialContext;

      // 正向执行
      for (const step of steps) {
        try {
          context = await step.execute(context);
          completedSteps.push(step.name);
        } catch (err) {
          // 补偿已完成步骤（逆序）
          for (let i = completedSteps.length - 1; i >= 0; i--) {
            const compensateStep = steps.find((s) => s.name === completedSteps[i]);
            if (compensateStep) {
              try {
                context = await compensateStep.compensate(context);
              } catch {
                // 补偿失败，记录但继续
              }
            }
          }

          return {
            status: "failed",
            context,
            completedSteps,
            failedStep: step.name,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return {
        status: "completed",
        context,
        completedSteps,
      };
    },

    getSteps(): string[] {
      return steps.map((s) => s.name);
    },
  };
}

// TCC (Try-Confirm-Cancel) 模式

/** TCC 步骤定义 */
export interface TCCStep<T = unknown> {
  /** 步骤名称 */
  name: string;
  /** Try 阶段：预留资源
   * @param context 当前上下文
   * @returns 执行后的新上下文 */
  try: (context: T) => Promise<T>;
  /** Confirm 阶段：提交资源
   * @param context 当前上下文
   * @returns 执行后的新上下文 */
  confirm: (context: T) => Promise<T>;
  /** Cancel 阶段：回滚资源
   * @param context 当前上下文
   * @returns 执行后的新上下文 */
  cancel: (context: T) => Promise<T>;
}

/** TCC 编排器接口 */
export interface TCCOrchestrator<T> {
  /** 添加 TCC 步骤
   * @param step TCC 步骤 */
  addStep(step: TCCStep<T>): void;
  /** 执行 TCC 流程：Try → Confirm，Try 失败则 Cancel
   * @param initialContext 初始上下文
   * @returns Saga 风格执行结果 */
  execute(initialContext: T): Promise<SagaResult<T>>;
}

/**
 * 创建 TCC 编排器
 * Try 阶段预留资源 → Confirm 阶段提交 → Cancel 阶段回滚
 * @returns TCCOrchestrator 实例 */
export function createTCC<T>(): TCCOrchestrator<T> {
  const steps: TCCStep<T>[] = [];

  return {
    addStep(step: TCCStep<T>): void {
      steps.push(step);
    },

    async execute(initialContext: T): Promise<SagaResult<T>> {
      const triedSteps: string[] = [];
      let context = initialContext;

      // Try 阶段
      for (const step of steps) {
        try {
          context = await step.try(context);
          triedSteps.push(step.name);
        } catch (err) {
          // Cancel 已 try 的步骤
          for (let i = triedSteps.length - 1; i >= 0; i--) {
            const cancelStep = steps.find((s) => s.name === triedSteps[i]);
            if (cancelStep) {
              try {
                context = await cancelStep.cancel(context);
              } catch {
                // Cancel 失败，记录但继续
              }
            }
          }
          return {
            status: "failed",
            context,
            completedSteps: triedSteps,
            failedStep: step.name,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Confirm 阶段
      const confirmedSteps: string[] = [];
      for (const step of steps) {
        try {
          context = await step.confirm(context);
          confirmedSteps.push(step.name);
        } catch (err) {
          // Confirm 失败 — 需要补偿
          return {
            status: "failed",
            context,
            completedSteps: confirmedSteps,
            failedStep: step.name,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return {
        status: "completed",
        context,
        completedSteps: confirmedSteps,
      };
    },
  };
}
