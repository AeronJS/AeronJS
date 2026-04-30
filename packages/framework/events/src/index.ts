/**
 * @ventostack/events - 事件与任务模块统一导出
 *
 * 提供 VentoStack 框架的异步事件与任务调度基础设施，包括：
 * - 类型安全的事件总线（createEventBus / defineEvent）
 * - 任务调度器与 Cron 解析（createScheduler / parseCronToInterval）
 * - 内存消息队列（createMemoryQueue）
 * - 延迟队列（createDelayedQueue）
 * - 领域事件注册表（createDomainEventRegistry）
 * - 事件溯源存储（createMemoryEventStore）
 * - MQ 适配器与工厂（createMemoryMQAdapter / createMQAdapterFactory）
 * - 可靠投递（createReliableDelivery）
 * - 分布式调度器（createDistributedScheduler）
 * - 任务监控器（createTaskMonitor）
 * - 优先级事件队列（createEventQueue）
 * - Saga 与 TCC 分布式事务编排（createSaga / createTCC）
 */

/** 创建内存事件总线与事件定义工具 */
export { createEventBus, defineEvent } from "./event-bus";
export type { EventBus, EventDefinition, EventHandler } from "./event-bus";

/** 创建任务调度器与 Cron 表达式解析 */
export { createScheduler, parseCronToInterval } from "./scheduler";
export type { Scheduler, ScheduleOptions, ScheduledTask } from "./scheduler";

/** 创建内存消息队列 */
export { createMemoryQueue } from "./message-queue";
export type { Message, MessageHandler, MessageQueue, QueueOptions } from "./message-queue";

/** 创建延迟队列 */
export { createDelayedQueue } from "./delayed-queue";
export type { DelayedMessage, DelayedQueue } from "./delayed-queue";

/** 创建领域事件注册表 */
export { createDomainEventRegistry } from "./domain-events";
export type {
  DomainEvent,
  DomainEventHandler,
  DomainEventRegistry,
  DomainEventType,
} from "./domain-events";

/** 创建内存事件溯源存储 */
export { createMemoryEventStore } from "./event-sourcing";
export type { EventStore, StoredEvent } from "./event-sourcing";

/** 创建内存 MQ 适配器与适配器工厂 */
export { createMemoryMQAdapter, createMQAdapterFactory } from "./mq-adapter";
export type { MQAdapter, MQMessage, MQMessageHandler, MQAdapterConfig } from "./mq-adapter";

/** 创建可靠投递封装 */
export { createReliableDelivery } from "./reliable-delivery";
export type {
  ReliableDelivery,
  ReliableMessage,
  ReliableDeliveryOptions,
} from "./reliable-delivery";

/** 创建分布式调度器 */
export { createDistributedScheduler } from "./distributed-scheduler";
export type {
  DistributedScheduler,
  DistributedTask,
  TaskLock,
  DistributedSchedulerOptions,
} from "./distributed-scheduler";

/** 创建任务监控器 */
export { createTaskMonitor } from "./task-monitor";
export type { TaskMonitor, TaskRecord, TaskLogEntry, TaskStatus } from "./task-monitor";

/** 创建事件队列 */
export { createEventQueue } from "./event-queue";
export type { EventQueue, QueuedEvent, EventQueueOptions } from "./event-queue";

/** 创建 Saga 编排器与 TCC 编排器 */
export { createSaga, createTCC } from "./saga";
export type {
  SagaOrchestrator,
  SagaStep,
  SagaResult,
  SagaStatus,
  TCCOrchestrator,
  TCCStep,
} from "./saga";
