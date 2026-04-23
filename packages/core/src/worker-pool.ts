// @ventostack/core - Worker Pool（Bun Worker Threads）

/** Worker 任务 */
export interface WorkerTask<T = unknown> {
  /** 任务类型 */
  type: string;
  /** 任务载荷 */
  payload: T;
}

/** Worker 执行结果 */
export interface WorkerResult<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
}

/** Worker 线程池配置选项 */
export interface WorkerPoolOptions {
  /** Worker 脚本路径 */
  workerURL: string | URL;
  /** 最小 Worker 数量 */
  minWorkers?: number;
  /** 最大 Worker 数量 */
  maxWorkers?: number;
  /** 任务超时（毫秒） */
  taskTimeout?: number;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
}

/** Worker 线程池接口 */
export interface WorkerPool {
  /**
   * 提交任务到线程池
   * @param task - 工作任务
   * @returns 执行结果
   */
  execute<T = unknown, R = unknown>(task: WorkerTask<T>): Promise<WorkerResult<R>>;
  /** 获取活跃 Worker 数量 */
  size(): number;
  /** 获取空闲 Worker 数量 */
  idle(): number;
  /** 关闭 Pool */
  terminate(): void;
}

/**
 * 创建 Worker 线程池
 * @param options - 线程池配置选项
 * @returns WorkerPool 实例
 */
export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  const {
    workerURL,
    minWorkers = 1,
    maxWorkers = navigator.hardwareConcurrency || 4,
    taskTimeout = 30_000,
  } = options;

  const workers: PooledWorker[] = [];
  const taskQueue: Array<{
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
  }> = [];

  function spawnWorker(): PooledWorker {
    const worker = new Worker(workerURL);
    const pooled: PooledWorker = { worker, busy: false };
    workers.push(pooled);
    return pooled;
  }

  // 预热最小数量的 Workers
  for (let i = 0; i < minWorkers; i++) {
    spawnWorker();
  }

  function getIdleWorker(): PooledWorker | null {
    return workers.find((w) => !w.busy) ?? null;
  }

  function processQueue(): void {
    while (taskQueue.length > 0) {
      let worker = getIdleWorker();

      if (!worker && workers.length < maxWorkers) {
        worker = spawnWorker();
      }

      if (!worker) break;

      const item = taskQueue.shift()!;
      worker.busy = true;

      const timer = setTimeout(() => {
        worker!.busy = false;
        item.reject(new Error(`Worker task timed out after ${taskTimeout}ms`));
        processQueue();
      }, taskTimeout);

      worker.worker.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        worker!.busy = false;
        item.resolve(event.data as WorkerResult);
        processQueue();
      };

      worker.worker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer);
        worker!.busy = false;
        item.reject(new Error(event.message || "Worker error"));
        processQueue();
      };

      worker.worker.postMessage(item.task);
    }
  }

  return {
    execute<T = unknown, R = unknown>(task: WorkerTask<T>): Promise<WorkerResult<R>> {
      return new Promise((resolve, reject) => {
        taskQueue.push({
          task,
          resolve: resolve as (r: WorkerResult) => void,
          reject,
        });
        processQueue();
      });
    },

    size() {
      return workers.length;
    },

    idle() {
      return workers.filter((w) => !w.busy).length;
    },

    terminate() {
      for (const w of workers) {
        w.worker.terminate();
      }
      workers.length = 0;
      taskQueue.length = 0;
    },
  };
}
