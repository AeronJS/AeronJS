---
title: 任务调度概述
description: '任务调度模块提供定时任务的创建、启停、执行日志管理及 Cron 表达式校验，与 @ventostack/events 调度器集成。'
---

## 概述

任务调度模块基于 `@ventostack/events` 的调度能力，提供可视化的定时任务管理界面。支持任务的增删改查、手动触发、启停控制及执行日志查看。

## 架构关系

```
@ventostack/system (scheduler)
        │
        │  使用
        ▼
@ventostack/events (scheduler)
        │
        │  基于
        ▼
@ventostack/core (lifecycle)
```

平台层的任务调度模块在框架层调度器之上增加了：
- 任务持久化（数据库存储）
- 管理接口（CRUD API）
- 执行日志（记录每次执行结果）
- Cron 表达式校验
- 任务状态管理

## 任务 CRUD

### 创建任务

```typescript
POST /api/system/scheduler
{
  "name": "清理过期会话",
  "group": "system",
  "handler": "cleanExpiredSessions",
  "cron": "0 0 3 * * ?",         // Cron 表达式
  "params": {                     // 传递给 handler 的参数
    "maxAge": 86400
  },
  "strategy": "abort",            // 并发策略: abort | skip | parallel
  "retryCount": 3,                // 失败重试次数
  "retryInterval": 60,            // 重试间隔（秒）
  "timeout": 300,                 // 超时时间（秒）
  "remark": "每天凌晨 3 点清理过期会话"
}
```

### 查询任务

```typescript
GET /api/system/scheduler?page=1&pageSize=10&group=system&status=running

// 响应
{
  "total": 20,
  "rows": [
    {
      "id": "job-001",
      "name": "清理过期会话",
      "group": "system",
      "handler": "cleanExpiredSessions",
      "cron": "0 0 3 * * ?",
      "cronDescription": "每天 03:00",
      "status": "running",          // pending | running | paused | completed | error
      "strategy": "abort",
      "retryCount": 3,
      "timeout": 300,
      "lastExecutedAt": "2024-06-01T03:00:00Z",
      "lastResult": "success",
      "nextExecuteAt": "2024-06-02T03:00:00Z",
      "remark": "每天凌晨 3 点清理过期会话"
    }
  ]
}
```

### 更新任务

```typescript
PUT /api/system/scheduler/{id}
{
  "cron": "0 0 4 * * ?",           // 修改为凌晨 4 点
  "params": {
    "maxAge": 172800               // 修改参数
  }
}

// 更新后自动重新注册调度
```

### 删除任务

```typescript
DELETE /api/system/scheduler/{id}

// 删除前自动停止调度
// 保留历史执行日志
```

## 启停控制

### 启动任务

```typescript
PUT /api/system/scheduler/{id}/start

// 效果：将任务注册到 @ventostack/events 调度器
```

### 暂停任务

```typescript
PUT /api/system/scheduler/{id}/pause

// 效果：从调度器移除，但保留任务配置
```

### 手动触发

```typescript
POST /api/system/scheduler/{id}/trigger

// 立即执行一次，不影响原有调度计划
// 返回执行 ID 用于追踪
{
  "executionId": "exec-001"
}
```

## 执行日志

每次任务执行都会记录详细日志：

```typescript
GET /api/system/scheduler/{id}/logs?page=1&pageSize=10&status=failed

// 响应
{
  "total": 100,
  "rows": [
    {
      "id": "exec-001",
      "jobId": "job-001",
      "jobName": "清理过期会话",
      "status": "success",          // success | failed | timeout | aborted
      "startTime": "2024-06-01T03:00:00Z",
      "endTime": "2024-06-01T03:00:05Z",
      "duration": 5000,             // 毫秒
      "result": "清理了 150 条过期会话",
      "error": null,
      "retryCount": 0,
      "triggerType": "cron"         // cron | manual
    }
  ]
}
```

日志保留策略：默认保留 30 天，可通过系统参数配置。

## Cron 表达式校验

创建和更新任务时自动校验 Cron 表达式的合法性：

```typescript
// 校验规则
// 1. 格式：支持 5 位（分 时 日 月 周）和 6 位（秒 分 时 日 月 周）
// 2. 范围校验：秒 0-59，分 0-59，时 0-23，日 1-31，月 1-12，周 0-7
// 3. 特殊字符：* , - / #
// 4. 频率限制：最小间隔不低于 1 分钟（防止高频任务）
// 5. 提供人类可读描述

validateCron('0 0 3 * * ?');   // ✓ "每天 03:00"
validateCron('*/5 * * * *');   // ✓ "每 5 分钟"
validateCron('0 0 31 2 *');    // ✗ "2 月没有 31 日"
validateCron('* * * * * * *'); // ✗ "无效的 Cron 表达式格式"
```

## 与框架调度器集成

```typescript
import { createSchedulerModule } from '@ventostack/system';
import { createEventBus } from '@ventostack/events';

const eventBus = createEventBus({ /* config */ });
const schedulerModule = createSchedulerModule({
  db,
  cache,
  eventBus,
  logger,
  handlers: {
    // 注册可用的 handler 函数
    cleanExpiredSessions: async (params) => {
      const count = await db.query`DELETE FROM sessions WHERE expires_at < NOW()`;
      return `清理了 ${count} 条过期会话`;
    },
    syncDictCache: async (params) => {
      // 字典缓存同步逻辑
    },
    generateDailyReport: async (params) => {
      // 日报生成逻辑
    },
  },
});

// 启动时从数据库加载所有 running 状态的任务
await schedulerModule.loadActiveJobs();
```

## 并发策略

| 策略 | 说明 |
|------|------|
| `abort` | 如果上一次执行未完成，中止当前触发 |
| `skip` | 如果上一次执行未完成，跳过当前触发 |
| `parallel` | 允许并行执行（需注意资源消耗） |

默认策略为 `abort`，防止任务堆积。
