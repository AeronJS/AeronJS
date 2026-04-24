---
title: Webhook
description: Webhook 功能说明
---

`@ventostack/events` 目前**未提供内置的 Webhook 管理器**。

## 当前状态

以下文档中描述的 API **不存在于源码中**：

- `createWebhookManager`
- `WebhookManager`
- `WebhookPayload`
- `webhooks.send()`
- `webhooks.verify()`
- `webhooks.sign()`

## 替代方案

如需 Webhook 功能，可结合框架现有能力自行实现：

1. **使用 `@ventostack/observability` 的 `createWebhookChannel`** — 用于错误告警的通用 Webhook 通道：

```typescript
import { createWebhookChannel } from "@ventostack/observability";

const channel = createWebhookChannel("https://hooks.example.com/notify", {
  "X-Custom-Header": "value",
});
```

2. **使用 `@ventostack/events` 的 `createMemoryQueue`** — 作为 Webhook 投递的异步队列：

```typescript
import { createMemoryQueue } from "@ventostack/events";

const queue = createMemoryQueue();

// 注册 Webhook 订阅
queue.subscribe("webhooks", async (message) => {
  const { url, payload, secret } = message.payload as any;
  const signature = signPayload(payload, secret);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body: JSON.stringify(payload),
  });
});
```

3. **使用 `@ventostack/cache` 的 `createLock`** — 防止 Webhook 重复投递：

```typescript
import { createLock, createMemoryAdapter } from "@ventostack/cache";

const lock = createLock(createMemoryAdapter());
const l = await lock.acquire(`webhook:${eventId}`, { ttl: 60 });
if (l.acquired) {
  try {
    await deliverWebhook(payload);
  } finally {
    await l.release();
  }
}
```

## 计划中的功能

内置的 `createWebhookManager`（支持注册、签名验证、自动重试、幂等投递）尚未实现，将在后续版本中提供。
