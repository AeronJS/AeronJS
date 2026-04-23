/**
 * @ventostack/events - 类型安全的事件总线
 * 支持有序异步处理器执行与快照迭代保护
 */

/** 事件定义，携带编译期类型标记 */
export interface EventDefinition<T = unknown> {
  /** 事件名称 */
  name: string;
  /** @internal 类型标记 — 运行时永不设置 */
  _type?: T;
}

/**
 * 定义类型安全的事件
 * @param name 事件名称
 * @returns 事件定义对象
 */
export function defineEvent<T>(name: string): EventDefinition<T> {
  return { name };
}

/** 事件处理器类型 */
export type EventHandler<T = unknown> = (payload: T) => Promise<void> | void;

/** 事件总线接口 */
export interface EventBus {
  /**
   * 注册事件处理器
   * @param event 事件定义
   * @param handler 事件处理器
   * @returns 取消注册函数
   */
  on<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void;

  /**
   * 注册一次性事件处理器（执行后自动移除）
   * @param event 事件定义
   * @param handler 事件处理器
   * @returns 取消注册函数
   */
  once<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void;

  /**
   * 触发事件，顺序执行所有处理器
   * @param event 事件定义
   * @param payload 事件载荷
   */
  emit<T>(event: EventDefinition<T>, payload: T): Promise<void>;

  /**
   * 移除事件处理器
   * @param event 事件定义
   * @param handler 要移除的处理器（可选，不传则移除该事件所有处理器）
   */
  off<T>(event: EventDefinition<T>, handler?: EventHandler<T>): void;

  /** 移除所有事件的所有处理器 */
  removeAll(): void;

  /**
   * 获取指定事件的处理器数量
   * @param event 事件定义
   * @returns 处理器数量
   */
  listenerCount(event: EventDefinition<unknown>): number;
}

/**
 * 创建事件总线实例
 * 基于内存 Map 存储事件与处理器列表，emit 时快照复制防止迭代中修改
 * @returns 事件总线实例
 */
export function createEventBus(): EventBus {
  const listeners = new Map<string, EventHandler<unknown>[]>();

  /**
   * 获取或创建指定事件的处理器列表
   * @param name 事件名称
   * @returns 处理器列表
   */
  function getHandlers(name: string): EventHandler<unknown>[] {
    let handlers = listeners.get(name);
    if (!handlers) {
      handlers = [];
      listeners.set(name, handlers);
    }
    return handlers;
  }

  function on<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void {
    const handlers = getHandlers(event.name);
    handlers.push(handler as EventHandler<unknown>);
    return () => {
      off(event, handler);
    };
  }

  function once<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = async (payload) => {
      off(event, wrapper);
      await handler(payload);
    };
    return on(event, wrapper);
  }

  async function emit<T>(event: EventDefinition<T>, payload: T): Promise<void> {
    const handlers = listeners.get(event.name);
    if (!handlers || handlers.length === 0) return;

    // snapshot to avoid mutation during iteration
    const snapshot = [...handlers];
    const errors: unknown[] = [];

    for (const handler of snapshot) {
      try {
        await handler(payload);
      } catch (err) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `${errors.length} handler(s) failed for event "${event.name}"`,
      );
    }
  }

  function off<T>(event: EventDefinition<T>, handler?: EventHandler<T>): void {
    if (!handler) {
      listeners.delete(event.name);
      return;
    }
    const handlers = listeners.get(event.name);
    if (!handlers) return;
    const idx = handlers.indexOf(handler as EventHandler<unknown>);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
    if (handlers.length === 0) {
      listeners.delete(event.name);
    }
  }

  function removeAll(): void {
    listeners.clear();
  }

  function listenerCount(event: EventDefinition<unknown>): number {
    return listeners.get(event.name)?.length ?? 0;
  }

  return { on, once, emit, off, removeAll, listenerCount };
}
