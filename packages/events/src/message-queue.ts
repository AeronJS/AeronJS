/**
 * @ventostack/events - 内存消息队列
 * 支持重试、并发控制与多消费者订阅
 */

/** 消息数据结构 */
export interface Message<T = unknown> {
  /** 消息唯一标识 */
  id: string;
  /** 消息主题 */
  topic: string;
  /** 消息载荷 */
  payload: T;
  /** 消息头（可选） */
  headers?: Record<string, string>;
  /** 消息创建时间戳 */
  timestamp: number;
  /** 重试次数（可选） */
  retryCount?: number;
}

/** 消息处理器类型 */
export type MessageHandler<T = unknown> = (message: Message<T>) => Promise<void>;

/** 队列配置选项 */
export interface QueueOptions {
  /** 处理器失败时的最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试间隔（毫秒），默认 1000 */
  retryDelay?: number;
  /** 最大并发处理数，默认 1 */
  concurrency?: number;
}

/** 消息队列接口 */
export interface MessageQueue {
  /**
   * 发布消息到指定主题
   * @param topic 消息主题
   * @param payload 消息载荷
   * @param headers 消息头（可选）
   * @returns 消息 ID
   */
  publish<T>(topic: string, payload: T, headers?: Record<string, string>): Promise<string>;

  /**
   * 订阅指定主题的消息
   * @param topic 消息主题
   * @param handler 消息处理器
   * @param options 队列配置选项（可选）
   * @returns 取消订阅函数
   */
  subscribe<T>(topic: string, handler: MessageHandler<T>, options?: QueueOptions): () => void;

  /**
   * 取消指定主题的所有订阅
   * @param topic 消息主题
   */
  unsubscribe(topic: string): void;

  /**
   * 获取指定主题的待处理消息数量
   * @param topic 消息主题
   * @returns 待处理消息数
   */
  pending(topic: string): number;
}

/** 主题内部状态 */
interface TopicState<T = unknown> {
  /** 待处理消息列表 */
  messages: Message<T>[];
  /** 已注册的处理器与配置 */
  handlers: Array<{ handler: MessageHandler<T>; options: Required<QueueOptions> }>;
  /** 当前正在处理的消息数 */
  activeCount: number;
  /** 是否正在处理中 */
  processing: boolean;
}

/**
 * 创建内存消息队列实例
 * 支持多消费者、重试机制与并发控制
 * @returns 消息队列实例
 */
export function createMemoryQueue(): MessageQueue {
  const topics = new Map<string, TopicState>();

  /**
   * 获取或创建指定主题的状态
   * @param topic 主题名称
   * @returns 主题状态
   */
  function getTopicState(topic: string): TopicState {
    let state = topics.get(topic);
    if (!state) {
      state = { messages: [], handlers: [], activeCount: 0, processing: false };
      topics.set(topic, state);
    }
    return state;
  }

  /**
   * 处理指定主题的下一个消息
   * @param topic 主题名称
   */
  async function processNext(topic: string): Promise<void> {
    const state = getTopicState(topic);

    if (state.handlers.length === 0 || state.messages.length === 0) {
      state.processing = false;
      return;
    }

    // Find max concurrency across handlers
    const maxConcurrency = Math.max(...state.handlers.map((h) => h.options.concurrency));

    if (state.activeCount >= maxConcurrency) {
      return;
    }

    const message = state.messages.shift();
    if (!message) {
      state.processing = false;
      return;
    }

    state.activeCount++;

    // Run all handlers for this message
    const handlerPromises = state.handlers.map(async ({ handler, options }) => {
      await executeWithRetry(handler, message, options.maxRetries, options.retryDelay);
    });

    try {
      await Promise.all(handlerPromises);
    } finally {
      state.activeCount--;
      // Continue processing remaining messages
      if (state.messages.length > 0 && state.handlers.length > 0) {
        void processNext(topic);
      } else {
        state.processing = false;
      }
    }
  }

  /**
   * 带重试的消息处理执行
   * @param handler 消息处理器
   * @param message 消息对象
   * @param maxRetries 最大重试次数
   * @param retryDelay 重试间隔（毫秒）
   */
  async function executeWithRetry<T>(
    handler: MessageHandler<T>,
    message: Message<T>,
    maxRetries: number,
    retryDelay: number,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const msg = attempt > 0 ? { ...message, retryCount: attempt } : message;
        await handler(msg);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }
    throw lastError;
  }

  /**
   * 启动指定主题的消息处理
   * @param topic 主题名称
   */
  function startProcessing(topic: string): void {
    const state = getTopicState(topic);
    if (!state.processing && state.messages.length > 0 && state.handlers.length > 0) {
      state.processing = true;
      void processNext(topic);
    }
  }

  async function publish<T>(
    topic: string,
    payload: T,
    headers?: Record<string, string>,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const message: Message<T> = {
      id,
      topic,
      payload,
      timestamp: Date.now(),
      ...(headers ? { headers } : {}),
    };

    const state = getTopicState(topic) as TopicState<T>;
    state.messages.push(message);

    startProcessing(topic);

    return id;
  }

  function subscribe<T>(
    topic: string,
    handler: MessageHandler<T>,
    options?: QueueOptions,
  ): () => void {
    const state = getTopicState(topic) as TopicState<T>;
    const resolvedOptions: Required<QueueOptions> = {
      maxRetries: options?.maxRetries ?? 3,
      retryDelay: options?.retryDelay ?? 1000,
      concurrency: options?.concurrency ?? 1,
    };

    const entry = { handler, options: resolvedOptions };
    state.handlers.push(entry);

    // Start processing any pending messages
    startProcessing(topic);

    return () => {
      const idx = state.handlers.indexOf(entry);
      if (idx !== -1) {
        state.handlers.splice(idx, 1);
      }
    };
  }

  function unsubscribe(topic: string): void {
    const state = topics.get(topic);
    if (state) {
      state.handlers = [];
    }
  }

  function pending(topic: string): number {
    return topics.get(topic)?.messages.length ?? 0;
  }

  return { publish, subscribe, unsubscribe, pending };
}
