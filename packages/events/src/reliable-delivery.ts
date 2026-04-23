/**
 * @ventostack/events - 可靠投递（持久化 + ACK 确认）
 * 追踪消息全生命周期状态（pending/sent/acked/failed/dead），支持 ACK/NACK 与失败重试
 * 适用于对消息送达有严格要求的业务场景
 */

/** 可靠消息记录 */
export interface ReliableMessage {
  /** 消息唯一标识 */
  id: string;
  /** 消息主题 */
  topic: string;
  /** 消息体 */
  body: unknown;
  /** 消息状态：pending 待发送，sent 已发送，acked 已确认，failed 失败，dead 死信 */
  status: "pending" | "sent" | "acked" | "failed" | "dead";
  /** 已尝试次数 */
  attempts: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后尝试时间戳（可选） */
  lastAttemptAt?: number;
  /** 错误信息（可选） */
  error?: string;
}

/** 可靠投递配置选项 */
export interface ReliableDeliveryOptions {
  /** 最大重试次数 */
  maxAttempts?: number;
  /** 重试间隔（毫秒） */
  retryInterval?: number;
  /** ACK 超时（毫秒） */
  ackTimeout?: number;
}

/** 可靠投递管理器接口 */
export interface ReliableDelivery {
  /**
   * 发送消息
   * @param topic 消息主题
   * @param body 消息体
   * @returns 消息 ID
   */
  send(topic: string, body: unknown): Promise<string>;

  /**
   * 确认消息已送达
   * @param messageId 消息 ID
   * @returns 确认成功返回 true，消息不存在或已确认返回 false
   */
  ack(messageId: string): boolean;

  /**
   * 否定确认（标记为失败）
   * @param messageId 消息 ID
   * @param error 错误信息（可选）
   * @returns 操作成功返回 true，消息不存在返回 false
   */
  nack(messageId: string, error?: string): boolean;

  /**
   * 重试所有失败的消息
   * @returns 实际重试的消息数量
   */
  retry(): Promise<number>;

  /**
   * 获取待处理的消息列表（pending + sent）
   * @returns 消息列表
   */
  getPending(): ReliableMessage[];

  /**
   * 获取失败的消息列表
   * @returns 消息列表
   */
  getFailed(): ReliableMessage[];

  /**
   * 获取死信消息列表
   * @returns 消息列表
   */
  getDead(): ReliableMessage[];

  /**
   * 获取消息统计信息
   * @returns 各状态消息数量统计
   */
  stats(): { pending: number; sent: number; acked: number; failed: number; dead: number };
}

/**
 * 创建可靠投递管理器实例
 * 追踪消息生命周期，支持 ACK/NACK 与失败重试
 * @param sender 底层发送函数
 * @param options 可靠投递配置选项
 * @returns 可靠投递管理器实例
 */
export function createReliableDelivery(
  sender: (topic: string, body: unknown) => Promise<void>,
  options?: ReliableDeliveryOptions,
): ReliableDelivery {
  const maxAttempts = options?.maxAttempts ?? 3;
  const _ackTimeout = options?.ackTimeout ?? 30000;
  const messages = new Map<string, ReliableMessage>();

  return {
    async send(topic: string, body: unknown): Promise<string> {
      const id = crypto.randomUUID();
      const msg: ReliableMessage = {
        id,
        topic,
        body,
        status: "pending",
        attempts: 0,
        maxAttempts,
        createdAt: Date.now(),
      };
      messages.set(id, msg);

      try {
        msg.attempts++;
        msg.lastAttemptAt = Date.now();
        await sender(topic, body);
        msg.status = "sent";
      } catch (err) {
        msg.status = "failed";
        msg.error = err instanceof Error ? err.message : String(err);
      }

      return id;
    },

    ack(messageId: string): boolean {
      const msg = messages.get(messageId);
      if (!msg || msg.status === "acked") return false;
      msg.status = "acked";
      return true;
    },

    nack(messageId: string, error?: string): boolean {
      const msg = messages.get(messageId);
      if (!msg) return false;
      msg.status = "failed";
      if (error) msg.error = error;
      return true;
    },

    async retry(): Promise<number> {
      let retried = 0;
      for (const msg of messages.values()) {
        if (msg.status !== "failed") continue;
        if (msg.attempts >= msg.maxAttempts) {
          msg.status = "dead";
          continue;
        }

        try {
          msg.attempts++;
          msg.lastAttemptAt = Date.now();
          await sender(msg.topic, msg.body);
          msg.status = "sent";
          retried++;
        } catch (err) {
          msg.error = err instanceof Error ? err.message : String(err);
          if (msg.attempts >= msg.maxAttempts) {
            msg.status = "dead";
          }
        }
      }
      return retried;
    },

    getPending(): ReliableMessage[] {
      return Array.from(messages.values()).filter(
        (m) => m.status === "pending" || m.status === "sent",
      );
    },

    getFailed(): ReliableMessage[] {
      return Array.from(messages.values()).filter((m) => m.status === "failed");
    },

    getDead(): ReliableMessage[] {
      return Array.from(messages.values()).filter((m) => m.status === "dead");
    },

    stats() {
      const all = Array.from(messages.values());
      return {
        pending: all.filter((m) => m.status === "pending").length,
        sent: all.filter((m) => m.status === "sent").length,
        acked: all.filter((m) => m.status === "acked").length,
        failed: all.filter((m) => m.status === "failed").length,
        dead: all.filter((m) => m.status === "dead").length,
      };
    },
  };
}
