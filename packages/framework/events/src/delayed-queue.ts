/**
 * @ventostack/events - 内存延迟队列
 * 支持按时间计划投递消息，基于二分查找维护有序消息列表
 * 适用于定时任务、延迟通知、超时处理等场景
 */

/** 延迟消息对象 */
export interface DelayedMessage<T = unknown> {
  /** 消息唯一标识 */
  id: string;
  /** 消息载荷 */
  payload: T;
  /** 计划执行的时间戳（毫秒） */
  executeAt: number;
  /** 消息主题 */
  topic: string;
}

/** 延迟队列接口 */
export interface DelayedQueue {
  /** 投递一条延迟消息
   * @param topic 消息主题
   * @param payload 消息载荷
   * @param delayMs 延迟毫秒数
   * @returns 消息唯一标识 id */
  schedule<T>(topic: string, payload: T, delayMs: number): string;
  /** 取消指定消息
   * @param id 消息唯一标识
   * @returns 是否成功取消 */
  cancel(id: string): boolean;
  /** 获取当前待处理消息数量
   * @returns 待处理数量 */
  pending(): number;
  /** 启动轮询消费
   * @param pollInterval 轮询间隔毫秒数，默认 1000 */
  start(pollInterval?: number): void;
  /** 停止轮询消费 */
  stop(): void;
}

/** 创建内存延迟队列
 * @param handler 消息到期时的处理函数
 * @returns DelayedQueue 实例 */
export function createDelayedQueue(
  handler: (message: DelayedMessage) => Promise<void>,
): DelayedQueue {
  const messages: DelayedMessage[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  /** 按 executeAt 升序二分查找插入位置并插入消息
   * @param message 待插入的延迟消息 */
  function insertSorted(message: DelayedMessage): void {
    // Binary-search insert to keep sorted by executeAt ascending
    let lo = 0;
    let hi = messages.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (messages[mid]!.executeAt <= message.executeAt) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    messages.splice(lo, 0, message);
  }

  function schedule<T>(topic: string, payload: T, delayMs: number): string {
    const id = crypto.randomUUID();
    const message: DelayedMessage<T> = {
      id,
      payload,
      executeAt: Date.now() + delayMs,
      topic,
    };
    insertSorted(message as DelayedMessage);
    return id;
  }

  function cancel(id: string): boolean {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    messages.splice(idx, 1);
    return true;
  }

  function pending(): number {
    return messages.length;
  }

  async function poll(): Promise<void> {
    const now = Date.now();
    // Process all due messages (they are sorted, so we can stop early)
    while (messages.length > 0 && messages[0]!.executeAt <= now) {
      const message = messages.shift()!;
      try {
        await handler(message);
      } catch {
        // Swallow — handler errors must not crash the poll loop.
      }
    }
  }

  function start(pollInterval = 1000): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      void poll();
    }, pollInterval);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { schedule, cancel, pending, start, stop };
}
