---
title: 消息中心概述
description: '消息中心模块提供站内消息、邮件和短信通知能力，通过频道适配器和 EventBus 实现灵活的消息分发。'
---

## 概述

消息中心是 VentoStack 平台层的统一消息管理模块，支持站内消息、邮件和短信三种通知渠道。通过频道适配器模式，可以灵活扩展新的消息通道。

## 架构

```
┌──────────────────────────────────────────┐
│              消息中心 API                  │
├──────────────────────────────────────────┤
│           消息分发器 (Dispatcher)          │
│  ┌──────────┬──────────┬──────────────┐  │
│  │ 站内消息  │   邮件   │    短信      │  │
│  │ Adapter  │ Adapter  │   Adapter    │  │
│  └──────────┴──────────┴──────────────┘  │
├──────────────────────────────────────────┤
│          EventBus (事件驱动)              │
├──────────────────────────────────────────┤
│    @ventostack/events                    │
└──────────────────────────────────────────┘
```

## 站内消息

### 发送站内消息

```typescript
POST /api/system/notification/message
{
  "title": "审批通知",
  "content": "您有一条新的审批待处理",
  "type": "info",                   // info | warning | success | error
  "targetType": "user",             // all | dept | user
  "targetIds": ["user-001"],
  "priority": "normal",             // low | normal | high | urgent
  "link": "/approval/detail/123"    // 关联链接（可选）
}
```

### 查询站内消息

```typescript
// 用户端查询自己的消息
GET /api/system/notification/message?page=1&pageSize=10&type=info&isRead=false

// 响应
{
  "total": 30,
  "rows": [
    {
      "id": "msg-001",
      "title": "审批通知",
      "content": "您有一条新的审批待处理",
      "type": "info",
      "priority": "normal",
      "isRead": false,
      "link": "/approval/detail/123",
      "createdAt": "2024-06-01T12:00:00Z"
    }
  ]
}
```

### 标记已读

```typescript
// 标记单条已读
PUT /api/system/notification/message/{id}/read

// 全部标记已读
PUT /api/system/notification/message/read-all
```

### 未读数量

```typescript
GET /api/system/notification/message/unread-count

// 响应
{ "count": 5 }
```

## 邮件通知

### 邮件模板管理

```typescript
// 创建模板
POST /api/system/notification/email/template
{
  "name": "welcome",
  "subject": "欢迎加入 {{appName}}",
  "body": "<h1>欢迎，{{username}}！</h1><p>您的账号已创建成功。</p>",
  "params": ["appName", "username"]    // 模板变量声明
}
```

### 发送邮件

```typescript
POST /api/system/notification/email/send
{
  "templateName": "welcome",
  "to": ["user@example.com"],
  "params": {
    "appName": "VentoStack",
    "username": "张三"
  }
}
```

### SMTP 配置

通过系统参数配置 SMTP：

```typescript
// sys.mail.smtp 参数值（JSON）
{
  "host": "smtp.example.com",
  "port": 465,
  "ssl": true,
  "username": "noreply@example.com",
  "password": "encrypted:..."        // 加密存储
}
```

## 短信通知

### 短信模板管理

```typescript
// 创建模板
POST /api/system/notification/sms/template
{
  "name": "verify_code",
  "content": "您的验证码是 ${code}，${expireMinutes} 分钟内有效。",
  "params": ["code", "expireMinutes"],
  "signName": "VentoStack"
}
```

### 发送短信

```typescript
POST /api/system/notification/sms/send
{
  "templateName": "verify_code",
  "phoneNumbers": ["13800138000"],
  "params": {
    "code": "123456",
    "expireMinutes": "5"
  }
}
```

### 短信渠道适配

短信发送通过适配器模式支持不同服务商：

```typescript
const smsAdapter = createAliyunSmsAdapter({
  accessKeyId: process.env.SMS_ACCESS_KEY,
  accessKeySecret: process.env.SMS_SECRET_KEY,
  signName: 'VentoStack',
});

// 或使用腾讯云
const smsAdapter = createTencentSmsAdapter({ /* config */ });

const notification = createNotificationCenter({
  smsAdapter,
  // ...
});
```

## EventBus 集成

消息中心通过 `@ventostack/events` 的 EventBus 实现事件驱动的消息发送：

```typescript
import { createNotificationCenter } from '@ventostack/system';
import { createEventBus } from '@ventostack/events';

const eventBus = createEventBus({ /* config */ });

const notificationCenter = createNotificationCenter({
  db,
  cache,
  eventBus,
  logger,
  channels: {
    email: createEmailChannel({ smtpConfig }),
    sms: createSmsChannel({ adapter: smsAdapter }),
  },
});

// 订阅业务事件，自动发送通知
eventBus.on('user.created', async (event) => {
  await notificationCenter.send({
    channel: 'email',
    template: 'welcome',
    to: [event.data.email],
    params: { username: event.data.username },
  });
});

eventBus.on('order.approved', async (event) => {
  await notificationCenter.send({
    channel: 'in-app',
    title: '订单审批通过',
    content: `订单 ${event.data.orderNo} 已审批通过`,
    targetType: 'user',
    targetIds: [event.data.createBy],
  });
});
```

## 频道适配器接口

```typescript
interface NotificationChannel {
  /** 频道名称 */
  name: string;

  /** 发送通知 */
  send(message: ChannelMessage): Promise<ChannelResult>;

  /** 检查频道是否可用 */
  healthCheck(): Promise<boolean>;
}

interface ChannelMessage {
  to: string[];
  title?: string;
  content: string;
  template?: string;
  params?: Record<string, string>;
}

interface ChannelResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
```

实现自定义频道只需实现此接口：

```typescript
const webhookChannel: NotificationChannel = {
  name: 'webhook',
  async send(message) {
    const response = await fetch(process.env.NOTIFICATION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    return { success: response.ok };
  },
  async healthCheck() {
    try {
      await fetch(process.env.NOTIFICATION_WEBHOOK_URL, { method: 'HEAD' });
      return true;
    } catch {
      return false;
    }
  },
};
```
