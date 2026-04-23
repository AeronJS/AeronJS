/**
 * @ventostack/events - 领域事件注册表
 * 提供 ORM 生命周期钩子风格的事件注册与触发，支持 beforeCreate/afterCreate 等六种事件类型
 * 适用于实体状态变更监听、审计日志、缓存失效等场景
 */

/** 领域事件类型，对应实体生命周期各阶段 */
export type DomainEventType =
  | "beforeCreate"
  | "afterCreate"
  | "beforeUpdate"
  | "afterUpdate"
  | "beforeDelete"
  | "afterDelete";

/** 领域事件对象 */
export interface DomainEvent<T = unknown> {
  /** 事件类型 */
  type: DomainEventType;
  /** 实体名称 */
  entity: string;
  /** 事件载荷数据 */
  payload: T;
  /** 事件发生时间戳 */
  timestamp: number;
}

/** 领域事件处理器 */
export type DomainEventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

/** 领域事件注册表接口 */
export interface DomainEventRegistry {
  /** 注册指定实体与事件类型的处理器
   * @param entity 实体名称
   * @param type 事件类型
   * @param handler 事件处理器
   * @returns 取消注册函数 */
  register<T>(entity: string, type: DomainEventType, handler: DomainEventHandler<T>): () => void;
  /** 触发指定实体与事件类型的事件，顺序执行所有处理器
   * @param entity 实体名称
   * @param type 事件类型
   * @param payload 事件载荷 */
  trigger<T>(entity: string, type: DomainEventType, payload: T): Promise<void>;
  /** 查询某实体已注册的处理器数量
   * @param entity 实体名称
   * @param type 可选的事件类型过滤，不传则统计该实体全部类型
   * @returns 处理器数量 */
  listHandlers(entity: string, type?: DomainEventType): number;
  /** 移除某实体的所有处理器，或全部清空
   * @param entity 实体名称，不传则清空所有实体 */
  removeAll(entity?: string): void;
}

/** 创建领域事件注册表
 * @returns DomainEventRegistry 实例 */
export function createDomainEventRegistry(): DomainEventRegistry {
  // key format: "entity:type"
  const handlers = new Map<string, DomainEventHandler<unknown>[]>();

  function makeKey(entity: string, type: DomainEventType): string {
    return `${entity}:${type}`;
  }

  function register<T>(
    entity: string,
    type: DomainEventType,
    handler: DomainEventHandler<T>,
  ): () => void {
    const key = makeKey(entity, type);
    let list = handlers.get(key);
    if (!list) {
      list = [];
      handlers.set(key, list);
    }
    list.push(handler as DomainEventHandler<unknown>);

    return () => {
      const current = handlers.get(key);
      if (!current) return;
      const idx = current.indexOf(handler as DomainEventHandler<unknown>);
      if (idx !== -1) {
        current.splice(idx, 1);
      }
      if (current.length === 0) {
        handlers.delete(key);
      }
    };
  }

  async function trigger<T>(entity: string, type: DomainEventType, payload: T): Promise<void> {
    const key = makeKey(entity, type);
    const list = handlers.get(key);
    if (!list || list.length === 0) return;

    const event: DomainEvent<T> = {
      type,
      entity,
      payload,
      timestamp: Date.now(),
    };

    const errors: unknown[] = [];
    for (const handler of [...list]) {
      try {
        await handler(event as DomainEvent<unknown>);
      } catch (err) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `${errors.length} handler(s) failed for domain event "${key}"`,
      );
    }
  }

  function listHandlers(entity: string, type?: DomainEventType): number {
    if (type !== undefined) {
      return handlers.get(makeKey(entity, type))?.length ?? 0;
    }
    // Count across all event types for this entity
    let count = 0;
    for (const [key, list] of handlers) {
      if (key.startsWith(`${entity}:`)) {
        count += list.length;
      }
    }
    return count;
  }

  function removeAll(entity?: string): void {
    if (entity === undefined) {
      handlers.clear();
      return;
    }
    const prefix = `${entity}:`;
    for (const key of [...handlers.keys()]) {
      if (key.startsWith(prefix)) {
        handlers.delete(key);
      }
    }
  }

  return { register, trigger, listHandlers, removeAll };
}
