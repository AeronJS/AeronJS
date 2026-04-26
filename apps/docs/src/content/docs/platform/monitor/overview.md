---
title: 系统监控概述
description: '系统监控模块提供在线用户管理、服务器状态、缓存监控、数据源监控及健康检查聚合能力。'
---

## 概述

系统监控模块提供运行时的系统状态观测能力，帮助管理员了解系统运行状况、排查问题并进行必要的运维操作。

## 在线用户

### 查询在线用户

```typescript
GET /api/system/monitor/online?page=1&pageSize=10&username=zhang

// 响应
{
  "total": 50,
  "rows": [
    {
      "sessionId": "sess-abc123",
      "userId": "user-001",
      "username": "zhangsan",
      "nickname": "张三",
      "deptName": "技术部",
      "ip": "192.168.1.100",
      "location": "北京市",
      "browser": "Chrome 125",
      "os": "macOS 14",
      "loginAt": "2024-06-01T08:30:00Z",
      "lastAccessAt": "2024-06-01T15:00:00Z"
    }
  ]
}
```

在线用户信息存储在 Redis 中，以 Session 为维度：

```
Key:   session:online:{sessionId}
Value: { userId, username, ip, browser, os, loginAt, lastAccessAt }
TTL:   与 Session 过期时间一致
```

### 强制下线

```typescript
DELETE /api/system/monitor/online/{sessionId}

// 效果：
// 1. 删除 Session
// 2. 撤销 Refresh Token
// 3. AccessToken 加入黑名单
// 4. 记录审计日志
```

## 服务器状态

### 获取服务器信息

```typescript
GET /api/system/monitor/server

// 响应
{
  "hostname": "ventostack-prod-01",
  "os": "Linux 5.15.0",
  "arch": "x64",
  "runtime": "Bun 1.1.0",
  "uptime": 864000,                 // 秒
  "cpu": {
    "model": "AMD EPYC 7763",
    "cores": 8,
    "usage": 45.2                   // 百分比
  },
  "memory": {
    "total": 16777216000,           // 16GB
    "used": 8388608000,             // 8GB
    "free": 8388608000,
    "usage": 50.0                   // 百分比
  },
  "disk": {
    "total": 107374182400,          // 100GB
    "used": 53687091200,            // 50GB
    "free": 53687091200,
    "usage": 50.0
  },
  "nodeEnv": "production",
  "startedAt": "2024-05-30T00:00:00Z"
}
```

## 缓存监控

### 缓存概览

```typescript
GET /api/system/monitor/cache

// 响应
{
  "adapter": "redis",
  "version": "7.2.0",
  "connected": true,
  "usedMemory": "256MB",
  "maxMemory": "2GB",
  "usedMemoryPercent": 12.5,
  "totalKeys": 15000,
  "expiresKeys": 8000,
  "hitRate": 95.3,                  // 缓存命中率
  "opsPerSecond": 1200,
  "connectedClients": 5,
  "uptime": 864000
}
```

### 缓存 Key 管理

```typescript
// 查询缓存 Key 列表
GET /api/system/monitor/cache/keys?pattern=dict:*&page=1&pageSize=20

// 响应
{
  "total": 50,
  "keys": [
    {
      "key": "dict:tenant-001:sys_user_sex",
      "ttl": -1,                    // -1 表示永不过期
      "type": "string",
      "size": 256
    }
  ]
}

// 查看缓存值
GET /api/system/monitor/cache/keys/{key}

// 清除缓存 Key
DELETE /api/system/monitor/cache/keys/{key}
```

缓存 Key 管理操作需要 `system:monitor:cache` 权限，且所有操作记录审计日志。

## 数据源监控

### 数据库连接池状态

```typescript
GET /api/system/monitor/datasource

// 响应
{
  "adapter": "postgres",
  "version": "16.2",
  "connected": true,
  "pool": {
    "total": 20,
    "active": 8,
    "idle": 12,
    "waiting": 0
  },
  "stats": {
    "queriesPerSecond": 150,
    "avgQueryTime": 5.2,            // 毫秒
    "slowQueries": 3,               // 慢查询数量（> 1s）
    "totalQueries": 1250000
  },
  "replication": {
    "lag": 0,                       // 复制延迟（毫秒）
    "status": "connected"
  }
}
```

## 健康检查聚合

### 综合健康状态

```typescript
GET /api/system/monitor/health

// 响应
{
  "status": "healthy",              // healthy | degraded | unhealthy
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 2,                 // 毫秒
      "message": null
    },
    "redis": {
      "status": "healthy",
      "latency": 1,
      "message": null
    },
    "disk": {
      "status": "degraded",
      "usage": 85,                  // 磁盘使用率
      "message": "磁盘使用率超过 80%"
    },
    "memory": {
      "status": "healthy",
      "usage": 50,
      "message": null
    }
  },
  "uptime": 864000,
  "version": "1.0.0",
  "checkedAt": "2024-06-01T15:00:00Z"
}
```

健康检查聚合了 `@ventostack/core` 的 HealthCheck 能力，统一返回所有组件的健康状态。`status` 取所有检查项中最差的状态。
