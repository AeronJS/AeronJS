/**
 * @ventostack/events - 内存事件溯源存储
 * 支持乐观并发控制与快照机制，基于 Map 实现聚合根事件流存储
 * 适用于需要完整审计轨迹与状态重建的领域模型
 */

/** 存储的事件记录 */
export interface StoredEvent<T = unknown> {
  /** 事件唯一标识 */
  id: string;
  /** 聚合根 ID */
  aggregateId: string;
  /** 聚合根类型 */
  aggregateType: string;
  /** 事件类型 */
  eventType: string;
  /** 事件载荷 */
  payload: T;
  /** 版本号（用于乐观并发控制） */
  version: number;
  /** 事件发生时间戳 */
  timestamp: number;
  /** 可选的元数据 */
  metadata?: Record<string, unknown>;
}

/** 事件存储接口 */
export interface EventStore {
  /**
   * 追加事件到聚合根流
   * @param aggregateId 聚合根 ID
   * @param aggregateType 聚合根类型
   * @param events 要追加的事件列表
   * @param expectedVersion 期望的当前版本（乐观并发控制）
   * @returns 存储后的事件记录列表
   * @throws 版本冲突时抛出 Error
   */
  append(
    aggregateId: string,
    aggregateType: string,
    events: Array<{
      eventType: string;
      payload: unknown;
      metadata?: Record<string, unknown>;
    }>,
    expectedVersion: number,
  ): Promise<StoredEvent[]>;

  /**
   * 获取聚合根的事件流
   * @param aggregateId 聚合根 ID
   * @param fromVersion 起始版本（可选，默认从第一个事件开始）
   * @returns 事件记录列表
   */
  getEvents(aggregateId: string, fromVersion?: number): Promise<StoredEvent[]>;

  /**
   * 获取聚合根的最新版本号
   * @param aggregateId 聚合根 ID
   * @returns 最新版本号，无事件时返回 0
   */
  getLatestVersion(aggregateId: string): Promise<number>;

  /**
   * 保存聚合根快照
   * @param aggregateId 聚合根 ID
   * @param state 聚合根状态
   * @param version 快照对应的版本号
   */
  saveSnapshot(aggregateId: string, state: unknown, version: number): Promise<void>;

  /**
   * 获取聚合根快照
   * @param aggregateId 聚合根 ID
   * @returns 快照状态与版本号，不存在返回 null
   */
  getSnapshot(aggregateId: string): Promise<{ state: unknown; version: number } | null>;
}

/**
 * 创建内存事件存储实例
 * 基于 Map 实现，支持乐观并发控制与快照
 * @returns 事件存储实例
 */
export function createMemoryEventStore(): EventStore {
  const streams = new Map<string, StoredEvent[]>();
  const snapshots = new Map<string, { state: unknown; version: number }>();

  async function append(
    aggregateId: string,
    aggregateType: string,
    events: Array<{
      eventType: string;
      payload: unknown;
      metadata?: Record<string, unknown>;
    }>,
    expectedVersion: number,
  ): Promise<StoredEvent[]> {
    const stream = streams.get(aggregateId) ?? [];
    const currentVersion = stream.length > 0 ? stream[stream.length - 1]!.version : 0;

    if (currentVersion !== expectedVersion) {
      throw new Error(
        `Concurrency conflict: expected version ${expectedVersion}, but current version is ${currentVersion}`,
      );
    }

    const stored: StoredEvent[] = [];
    let version = currentVersion;

    for (const event of events) {
      version++;
      const storedEvent: StoredEvent = {
        id: crypto.randomUUID(),
        aggregateId,
        aggregateType,
        eventType: event.eventType,
        payload: event.payload,
        version,
        timestamp: Date.now(),
        ...(event.metadata ? { metadata: event.metadata } : {}),
      };
      stream.push(storedEvent);
      stored.push(storedEvent);
    }

    streams.set(aggregateId, stream);
    return stored;
  }

  async function getEvents(aggregateId: string, fromVersion?: number): Promise<StoredEvent[]> {
    const stream = streams.get(aggregateId) ?? [];
    if (fromVersion === undefined) return [...stream];
    return stream.filter((e) => e.version >= fromVersion);
  }

  async function getLatestVersion(aggregateId: string): Promise<number> {
    const stream = streams.get(aggregateId);
    if (!stream || stream.length === 0) return 0;
    return stream[stream.length - 1]!.version;
  }

  async function saveSnapshot(aggregateId: string, state: unknown, version: number): Promise<void> {
    snapshots.set(aggregateId, { state, version });
  }

  async function getSnapshot(
    aggregateId: string,
  ): Promise<{ state: unknown; version: number } | null> {
    return snapshots.get(aggregateId) ?? null;
  }

  return { append, getEvents, getLatestVersion, saveSnapshot, getSnapshot };
}
