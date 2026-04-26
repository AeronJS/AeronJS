---
title: 代码生成概述
description: '代码生成器模块提供从数据库表自动生成 CRUD 代码的能力，支持单表、树形和主从模板类型。'
---

## 概述

代码生成器从数据库表结构自动生成后端 CRUD 代码和前端页面代码，减少重复劳动。支持多种模板类型，生成的代码遵循 VentoStack 工程规范。

## 工作流程

```
数据库表 → 导入表结构 → 配置生成选项 → 预览代码 → 下载代码包
```

## 表导入

### 查询可导入的表

```typescript
GET /api/system/gen/tables?page=1&pageSize=10&tableName=sys_

// 从数据库 information_schema 读取表列表
// 排除已导入的表
```

### 导入表

```typescript
POST /api/system/gen/import
{
  "tableNames": ["biz_order", "biz_order_item"]
}

// 导入后自动解析：
// 1. 表结构（列名、类型、注释、约束）
// 2. 主键信息
// 3. 索引信息
// 4. 外键关系（用于主从模板）
```

## 列配置

导入后可以自定义每列的生成属性：

```typescript
PUT /api/system/gen/table/{tableId}
{
  "tableName": "biz_order",
  "moduleName": "order",             // 生成代码的模块名
  "businessName": "order",           // 业务名（用于命名）
  "functionName": "订单管理",          // 功能描述
  "templateType": "master-detail",   // 模板类型
  "parentMenuId": "menu-biz",        // 上级菜单 ID
  "columns": [
    {
      "columnName": "id",
      "columnType": "bigint",
      "columnComment": "订单 ID",
      "javaType": "string",          // TypeScript 类型映射
      "queryType": "eq",             // 查询方式: eq | like | between | gt | lt | in
      "isRequired": true,            // 是否必填
      "isInsert": false,             // 是否在新增表单中显示
      "isEdit": false,               // 是否在编辑表单中显示
      "isList": true,                // 是否在列表中显示
      "isQuery": false,              // 是否作为查询条件
      "formType": "input",           // 表单控件类型
      "dictType": ""                 // 关联字典类型
    },
    {
      "columnName": "status",
      "columnType": "smallint",
      "columnComment": "订单状态",
      "tsType": "number",
      "queryType": "eq",
      "isRequired": true,
      "isInsert": false,
      "isEdit": true,
      "isList": true,
      "isQuery": true,
      "formType": "select",
      "dictType": "biz_order_status"
    }
  ]
}
```

## 模板类型

### 单表 (single)

适用于没有层级关系的普通业务表：

```
生成文件：
├── backend/
│   ├── service.ts          // Service 函数（CRUD + 分页查询）
│   ├── controller.ts       // HTTP 路由处理器
│   ├── schema.ts           // Zod 校验 Schema
│   └── types.ts            // TypeScript 类型定义
└── frontend/
    ├── index.vue            // 列表页面
    ├── form.vue             // 新增/编辑表单
    └── api.ts               // API 调用封装
```

### 树形 (tree)

适用于有父子层级关系的数据（如组织架构、分类）：

```
生成文件（在单表基础上增加）：
├── backend/
│   ├── service.ts          // 增加 buildTree / getDescendants 方法
│   └── ...
└── frontend/
    ├── index.vue            // 树形列表页面
    └── ...
```

需要指定树形关联字段：

```typescript
{
  "templateType": "tree",
  "treeCode": "id",          // 节点 ID 字段
  "treeParentCode": "parent_id", // 父节点字段
  "treeName": "name"         // 节点显示名称字段
}
```

### 主从 (master-detail)

适用于有主表和明细表关系的业务（如订单-订单项）：

```
生成文件：
├── backend/
│   ├── master/
│   │   ├── service.ts       // 主表 Service
│   │   ├── controller.ts    // 主表路由
│   │   ├── schema.ts        // 主表校验
│   │   └── types.ts         // 主表类型
│   ├── detail/
│   │   ├── service.ts       // 从表 Service
│   │   └── types.ts         // 从表类型
│   └── controller.ts        // 整合路由（主表 + 批量保存从表）
└── frontend/
    ├── index.vue             // 主表列表
    ├── form.vue              // 主表 + 从表编辑表单
    └── api.ts
```

## 代码预览

```typescript
GET /api/system/gen/preview/{tableId}

// 响应
{
  "files": [
    {
      "path": "backend/service.ts",
      "content": "// 生成的 Service 代码...",
      "language": "typescript"
    },
    {
      "path": "backend/controller.ts",
      "content": "// 生成的路由代码...",
      "language": "typescript"
    },
    {
      "path": "frontend/index.vue",
      "content": "<!-- 生成的前端页面 -->",
      "language": "vue"
    }
  ]
}
```

## 代码下载

```typescript
GET /api/system/gen/download/{tableId}

// 返回 ZIP 压缩包
// Content-Type: application/zip
// Content-Disposition: attachment; filename=order-module.zip
```

## CLI 集成

除了 API 方式，代码生成器也可通过 CLI 使用：

```bash
# 查看可生成的表
bun run cli gen:list

# 导入表并生成代码
bun run cli gen:generate --table biz_order --template single --module order

# 直接输出到项目目录（不下载 ZIP）
bun run cli gen:generate --table biz_order --output ./packages/system/src/modules/
```

## 生成代码规范

生成的代码遵循以下规范：

- 函数式风格，不使用 class
- 显式依赖注入，不使用 DI 容器
- 使用 `@ventostack/database` 的标签模板查询
- 使用 Zod Schema 做输入校验
- 完整的 TypeScript 类型定义
- 分页查询使用 `@ventostack/database` 的分页工具
- 路由注册使用 `@ventostack/core` 的路由 API
- 权限标识符遵循 `{module}:{business}:{action}` 命名规则
