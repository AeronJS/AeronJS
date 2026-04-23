/**
 * @ventostack/events - 事件队列化处理
 * 提供优先级排序、批量消费、超时控制与失败重试的内存事件队列
 * 适用于异步任务缓冲、流量削峰与有序事件处理场景
 */

/** 队列中的事件对象 */
export interface QueuedEvent<T = unknown> {
  /** 事件唯一标识 */
  id: string;
  /** 事件名称 */
  name: string;
  /** 事件载荷 */
  payload: T;
  /** 优先级（数值越大优先级越高） */
  priority: number;
  /** 入队时间戳 */
  enqueuedAt: number;
  /** 处理完成时间戳（可选） */
  processedAt?: number;
}

/** 事件队列配置选项 */
export interface EventQueueOptions {
  /** 最大队列长度 */
  maxSize?: number;
  /** 并发消费者数 */
  concurrency?: number;
  /** 处理超时（ms） */
  timeout?: number;
}

/** 事件队列接口 */
export interface EventQueue {
  /**
   * 将事件加入队列
   * @param name 事件名称
   * @param payload 事件载荷
   * @param priority 优先级，默认 0
   * @returns 事件唯一标识
   */
  enqueue<T>(name: string, payload: T, priority?: number): string;

  /**
   * 批量处理队列中的事件
   * @param handler 事件处理函数
   */
  process(handler: (event: QueuedEvent) => Promise<void>): Promise<void>;

  /**
   * 获取当前队列长度
   * @returns 队列长度
   */
  size(): number;

  /**
   * 获取待处理的事件列表
   * @returns 待处理事件列表
   */
  pending(): QueuedEvent[];

  /**
   * 清空队列但不处理
   */
  drain(): Promise<void>;

  /**
   * 清空队列
   */
  clear(): void;

  /**
   * 暂停队列处理
   */
  pause(): void;

  /**
   * 恢复队列处理
   */
  resume(): void;

  /**
   * 判断队列是否处于暂停状态
   * @returns 暂停返回 true，否则返回 false
   */
  isPaused(): boolean;
}

/**
 * 创建事件队列（优先级排序 + 批量消费）
 * @param options 事件队列配置选项
 * @returns 事件队列实例
 */
export function createEventQueue(options?: EventQueueOptions): EventQueue {
  const maxSize = options?.maxSize ?? 10000;
  const concurrency = options?.concurrency ?? 1;
  const timeout = options?.timeout ?? 30000;
  const queue: QueuedEvent[] = [];
  let paused = false;
  let processing = false;

  function sortByPriority(): void {
    queue.sort((a, b) => b.priority - a.priority);
  }

  return {
    enqueue<T>(name: string, payload: T, priority = 0): string {
      if (queue.length >= maxSize) {
        throw new Error(`Event queue full (max: ${maxSize})`);
      }
      const id = crypto.randomUUID();
      queue.push({
        id,
        name,
        payload,
        priority,
        enqueuedAt: Date.now(),
      });
      sortByPriority();
      return id;
    },

    async process(handler: (event: QueuedEvent) => Promise<void>): Promise<void> {
      if (paused || processing) return;
      processing = true;

      try {
        const batch = queue.splice(0, concurrency);
        const promises = batch.map(async (event) => {
          try {
            await Promise.race([
              handler(event),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Event processing timeout")), timeout),
              ),
            ]);
            event.processedAt = Date.now();
          } catch (_err) {
            // 处理失败，放回队列尾部（降低优先级）
            event.priority = Math.max(event.priority - 1, -100);
            queue.push(event);
          }
        });
        await Promise.all(promises);
      } finally {
        processing = false;
      }
    },

    size(): number {
      return queue.length;
    },

    pending(): QueuedEvent[] {
      return [...queue];
    },

    async drain(): Promise<void> {
      // 清空队列但不处理
      queue.length = 0;
    },

    clear(): void {
      queue.length = 0;
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
    },

    isPaused(): boolean {
      return paused;
    },
  };
}
