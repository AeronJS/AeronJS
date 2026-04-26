/**
 * @ventostack/system - RoleService
 * 角色管理服务：创建、更新、删除、查询、菜单分配、数据范围分配
 */

import type { Cache } from "@ventostack/cache";
import type { SqlExecutor } from "@ventostack/database";
import type { PaginatedResult } from "./user";

/** 创建角色参数 */
export interface CreateRoleParams {
  name: string;
  code: string;
  sort?: number;
  dataScope?: number;
  remark?: string;
}

/** 角色详情 */
export interface RoleDetail {
  id: string;
  name: string;
  code: string;
  sort: number;
  dataScope: number | null;
  status: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 角色列表项 */
export interface RoleListItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  dataScope: number | null;
  status: number;
  createdAt: string;
}

/** 角色服务接口 */
export interface RoleService {
  create(params: CreateRoleParams): Promise<{ id: string }>;
  update(id: string, params: Partial<CreateRoleParams>): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<RoleDetail | null>;
  list(params?: {
    page?: number;
    pageSize?: number;
    status?: number;
  }): Promise<PaginatedResult<RoleListItem>>;
  assignMenus(roleId: string, menuIds: string[]): Promise<void>;
  assignDataScope(
    roleId: string,
    scope: number,
    deptIds?: string[],
  ): Promise<void>;
}

/**
 * 创建角色服务实例
 * @param deps 依赖项
 * @returns 角色服务实例
 */
export function createRoleService(deps: {
  executor: SqlExecutor;
  cache: Cache;
}): RoleService {
  const { executor, cache } = deps;

  return {
    async create(params) {
      const { name, code, sort, dataScope, remark } = params;
      const id = crypto.randomUUID();

      await executor(
        `INSERT INTO sys_role (id, name, code, sort, data_scope, status, remark, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, $6, NOW(), NOW())`,
        [id, name, code, sort ?? 0, dataScope ?? null, remark ?? null],
      );

      await cache.del("role:list");

      return { id };
    },

    async update(id, params) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const updatableFields: Record<string, unknown> = {
        name: params.name,
        code: params.code,
        sort: params.sort,
        data_scope: params.dataScope,
        remark: params.remark,
      };

      for (const [field, value] of Object.entries(updatableFields)) {
        if (value !== undefined) {
          fields.push(`${field} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) return;

      fields.push("updated_at = NOW()");
      values.push(id);

      await executor(
        `UPDATE sys_role SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
        values,
      );

      await cache.del(`role:detail:${id}`);
      await cache.del("role:list");
    },

    async delete(id) {
      // 先删除角色-菜单关联
      await executor(
        "DELETE FROM sys_role_menu WHERE role_id = $1",
        [id],
      );
      // 先删除用户-角色关联
      await executor(
        "DELETE FROM sys_user_role WHERE role_id = $1",
        [id],
      );
      // 软删除角色
      await executor(
        "UPDATE sys_role SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
        [id],
      );

      await cache.del(`role:detail:${id}`);
      await cache.del("role:list");
    },

    async getById(id) {
      const cached = await cache.get<RoleDetail>(`role:detail:${id}`);
      if (cached) return cached;

      const rows = await executor(
        `SELECT id, name, code, sort, data_scope, status, remark, created_at, updated_at
         FROM sys_role WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      const roles = rows as Array<Record<string, unknown>>;

      if (roles.length === 0) return null;

      const row = roles[0]!;
      const detail: RoleDetail = {
        id: row.id as string,
        name: row.name as string,
        code: row.code as string,
        sort: row.sort as number,
        dataScope: (row.data_scope as number) ?? null,
        status: row.status as number,
        remark: (row.remark as string) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };

      await cache.set(`role:detail:${id}`, detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, status } = params ?? {};
      const conditions: string[] = ["deleted_at IS NULL"];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (status !== undefined) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      const whereClause = conditions.join(" AND ");

      const countRows = await executor(
        `SELECT COUNT(*) as total FROM sys_role WHERE ${whereClause}`,
        values,
      );
      const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

      const offset = (page - 1) * pageSize;
      const listRows = await executor(
        `SELECT id, name, code, sort, data_scope, status, created_at
         FROM sys_role WHERE ${whereClause}
         ORDER BY sort ASC, created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, pageSize, offset],
      );

      const list = (listRows as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        code: row.code as string,
        sort: row.sort as number,
        dataScope: (row.data_scope as number) ?? null,
        status: row.status as number,
        createdAt: row.created_at as string,
      }));

      return { items: list, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async assignMenus(roleId, menuIds) {
      // 先删除旧的关联
      await executor(
        "DELETE FROM sys_role_menu WHERE role_id = $1",
        [roleId],
      );

      // 批量插入新关联
      if (menuIds.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const menuId of menuIds) {
          placeholders.push(`($${paramIndex}, $${paramIndex + 1})`);
          values.push(roleId, menuId);
          paramIndex += 2;
        }

        await executor(
          `INSERT INTO sys_role_menu (role_id, menu_id) VALUES ${placeholders.join(", ")}`,
          values,
        );
      }

      // 清除与角色相关的缓存
      await cache.del(`role:menus:${roleId}`);
      await cache.del("role:list");
    },

    async assignDataScope(roleId, scope, deptIds) {
      await executor(
        "UPDATE sys_role SET data_scope = $1, updated_at = NOW() WHERE id = $2",
        [scope, roleId],
      );

      // 如果提供了部门 ID，更新角色-部门关联表
      if (deptIds) {
        await executor(
          "DELETE FROM sys_role_dept WHERE role_id = $1",
          [roleId],
        );

        if (deptIds.length > 0) {
          const values: unknown[] = [];
          const placeholders: string[] = [];
          let paramIndex = 1;

          for (const deptId of deptIds) {
            placeholders.push(`($${paramIndex}, $${paramIndex + 1})`);
            values.push(roleId, deptId);
            paramIndex += 2;
          }

          await executor(
            `INSERT INTO sys_role_dept (role_id, dept_id) VALUES ${placeholders.join(", ")}`,
            values,
          );
        }
      }

      await cache.del(`role:detail:${roleId}`);
    },
  };
}
