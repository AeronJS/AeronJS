---
title: 系统管理概述
description: '@ventostack/system 提供企业级系统管理能力，包括用户、角色、权限、部门、字典、配置等核心业务模块。'
---

## 概述

`@ventostack/system` 是 VentoStack 平台层的系统管理模块，基于框架层的核心包构建，提供开箱即用的企业级后台管理能力。

它不是框架层的一部分，而是建立在框架层之上的业务级封装，将 `@ventostack/auth`、`@ventostack/database`、`@ventostack/cache`、`@ventostack/observability` 等底层能力组合成完整的系统管理解决方案。

## 架构定位

```
┌──────────────────────────────────────────────────┐
│              @ventostack/system                   │
│  (用户 / 角色 / 菜单 / 部门 / 字典 / 配置 / 通知)  │
├──────────────────────────────────────────────────┤
│  auth    │  database  │  cache  │  observability │
├──────────────────────────────────────────────────┤
│                   core                           │
└──────────────────────────────────────────────────┘
```

系统管理模块依赖关系：

- **@ventostack/auth** — 认证鉴权、RBAC 权限引擎、会话管理
- **@ventostack/database** — 数据持久化、事务管理、分页查询
- **@ventostack/cache** — 字典缓存、配置缓存、权限缓存
- **@ventostack/observability** — 操作审计、日志记录

## 快速开始

### 创建系统模块

```typescript
import { createSystemModule } from '@ventostack/system';
import { createDatabase } from '@ventostack/database';
import { createCache } from '@ventostack/cache';
import { createAuth } from '@ventostack/auth';
import { createLogger } from '@ventostack/observability';

const db = createDatabase({ url: 'postgres://...' });
const cache = createCache({ adapter: 'redis', url: 'redis://...' });
const auth = createAuth({ db, cache, secret: process.env.JWT_SECRET });
const logger = createLogger({ level: 'info' });

const system = createSystemModule({
  db,
  cache,
  auth,
  logger,
  tenantId: 'default', // 多租户场景下必填
});

// 注册路由
app.route('/api/system', system.router);
```

### 数据库表命名约定

所有系统管理相关的数据库表统一使用 `sys_` 前缀：

| 表名 | 说明 |
|------|------|
| `sys_user` | 用户表 |
| `sys_role` | 角色表 |
| `sys_menu` | 菜单权限表 |
| `sys_dept` | 部门表 |
| `sys_post` | 岗位表 |
| `sys_dict_type` | 字典类型表 |
| `sys_dict_data` | 字典数据表 |
| `sys_config` | 系统参数表 |
| `sys_notice` | 通知公告表 |
| `sys_user_role` | 用户角色关联表 |
| `sys_user_post` | 用户岗位关联表 |
| `sys_role_menu` | 角色菜单关联表 |
| `sys_role_dept` | 角色部门关联表（数据权限） |

### 模块组合

系统管理模块内部由以下子模块组成：

```
createSystemModule({
  userService,      // 用户管理
  roleService,      // 角色管理
  menuService,      // 菜单管理
  deptService,      // 部门管理
  postService,      // 岗位管理
  dictService,      // 字典管理
  configService,    // 参数配置
  noticeService,    // 通知公告
})
```

每个子模块可以独立使用，也可以通过 `createSystemModule` 统一注册。

## 多租户支持

在多租户场景下，系统管理模块的所有数据操作自动携带 `tenant_id` 约束：

- 查询时自动追加 `WHERE tenant_id = ?` 条件
- 写入时自动填充 `tenant_id` 字段
- 缓存 key 带 `tenant:{id}:` 前缀
- 审计日志记录 `tenant_id`

```typescript
const system = createSystemModule({
  db,
  cache,
  auth,
  logger,
  tenantId: 'tenant-001',
});
```
