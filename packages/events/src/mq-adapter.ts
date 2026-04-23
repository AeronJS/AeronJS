/**
 * @ventostack/events - 消息队列适配器接口
 * 定义统一 MQ 抽象，支持内存适配器及外部 MQ（Kafka/RabbitMQ/NATS 等）扩展注册
 * 内存适配器基于 Set 存储订阅者，publish 时同步调用所有处理器
 */

/** MQ 适配器接口 */
export interface MQAdapter {
  /** 适配器名称 */
  name: string;

  /**
   * 建立连接
   */
  connect(): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 发布消息到指定主题
   * @param topic 消息主题
   * @param message MQ 消息
   */
  publish(topic: string, message: MQMessage): Promise<void>;

  /**
   * 订阅指定主题的消息
   * @param topic 消息主题
   * @param handler 消息处理器
   * @returns 取消订阅函数
   */
  subscribe(topic: string, handler: MQMessageHandler): Promise<() => void>;

  /**
   * 判断是否已连接
   * @returns 已连接返回 true，否则返回 false
   */
  isConnected(): boolean;
}

/** MQ 消息结构 */
export interface MQMessage {
  /** 消息唯一标识（可选） */
  id?: string;
  /** 消息体 */
  body: unknown;
  /** 消息头（可选） */
  headers?: Record<string, string>;
  /** 时间戳（可选） */
  timestamp?: number;
}

/** MQ 消息处理器类型 */
export type MQMessageHandler = (message: MQMessage) => Promise<void>;

/** MQ 适配器配置 */
export interface MQAdapterConfig {
  /** 适配器类型 */
  type: "kafka" | "rabbitmq" | "nats" | "rocketmq" | "memory";
  /** 连接 URL（可选） */
  url?: string;
  /** 附加选项（可选） */
  options?: Record<string, unknown>;
}

/**
 * 创建内存 MQ 适配器（用于开发和测试）
 * 基于内存 Set 存储订阅者，publish 时同步调用所有处理器
 * @returns 内存 MQ 适配器实例
 */
export function createMemoryMQAdapter(): MQAdapter {
  const subscribers = new Map<string, Set<MQMessageHandler>>();
  let connected = false;

  return {
    name: "memory",

    async connect(): Promise<void> {
      connected = true;
    },

    async disconnect(): Promise<void> {
      connected = false;
      subscribers.clear();
    },

    async publish(topic: string, message: MQMessage): Promise<void> {
      if (!connected) throw new Error("MQ adapter not connected");
      const msg = {
        ...message,
        id: message.id ?? crypto.randomUUID(),
        timestamp: message.timestamp ?? Date.now(),
      };
      const handlers = subscribers.get(topic);
      if (handlers) {
        for (const handler of handlers) {
          await handler(msg);
        }
      }
    },

    async subscribe(topic: string, handler: MQMessageHandler): Promise<() => void> {
      if (!connected) throw new Error("MQ adapter not connected");
      let handlers = subscribers.get(topic);
      if (!handlers) {
        handlers = new Set();
        subscribers.set(topic, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers!.delete(handler);
      };
    },

    isConnected(): boolean {
      return connected;
    },
  };
}

/**
 * 创建 MQ 适配器工厂
 * 支持注册自定义适配器类型，默认内置 memory 适配器
 * 外部 MQ（Kafka/RabbitMQ/NATS）需用户提供具体实现
 * @returns MQ 适配器工厂
 */
export function createMQAdapterFactory(): {
  /**
   * 注册适配器类型工厂
   * @param type 适配器类型名称
   * @param factory 创建适配器的工厂函数
   */
  register(type: string, factory: (config: MQAdapterConfig) => MQAdapter): void;

  /**
   * 根据配置创建适配器实例
   * @param config 适配器配置
   * @returns MQ 适配器实例
   * @throws 未知类型时抛出 Error
   */
  create(config: MQAdapterConfig): MQAdapter;
} {
  const factories = new Map<string, (config: MQAdapterConfig) => MQAdapter>();
  factories.set("memory", () => createMemoryMQAdapter());

  return {
    register(type: string, factory: (config: MQAdapterConfig) => MQAdapter): void {
      factories.set(type, factory);
    },

    create(config: MQAdapterConfig): MQAdapter {
      const factory = factories.get(config.type);
      if (!factory) throw new Error(`Unknown MQ adapter type: ${config.type}`);
      return factory(config);
    },
  };
}
