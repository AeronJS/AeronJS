/**
 * @ventostack/system - UserService
 * 用户管理服务：创建、更新、删除、查询、密码重置、状态变更
 */

import type { Cache } from "@ventostack/cache";
import type { PasswordHasher } from "@ventostack/auth";
import type { SqlExecutor } from "@ventostack/database";

/** 创建用户参数 */
export interface CreateUserParams {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  nickname?: string;
  deptId?: string;
  status?: number;
  remark?: string;
}

/** 更新用户参数 */
export interface UpdateUserParams {
  email?: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  gender?: number;
  deptId?: string;
  status?: number;
  remark?: string;
}

/** 用户详情 */
export interface UserDetail {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  nickname: string | null;
  avatar: string | null;
  gender: number | null;
  status: number;
  deptId: string | null;
  mfaEnabled: boolean;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 用户列表项 */
export interface UserListItem {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  status: number;
  deptId: string | null;
  createdAt: string;
}

/** 用户列表查询参数 */
export interface UserListParams {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: number;
  deptId?: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 用户服务接口 */
export interface UserService {
  create(params: CreateUserParams): Promise<{ id: string }>;
  update(id: string, params: UpdateUserParams): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<UserDetail | null>;
  list(params: UserListParams): Promise<PaginatedResult<UserListItem>>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  updateStatus(id: string, status: number): Promise<void>;
  export(params?: UserListParams): Promise<string>;
}

/**
 * 创建用户服务实例
 * @param deps 依赖项
 * @returns 用户服务实例
 */
export function createUserService(deps: {
  executor: SqlExecutor;
  passwordHasher: PasswordHasher;
  cache: Cache;
}): UserService {
  const { executor, passwordHasher, cache } = deps;

  return {
    async create(params) {
      const {
        username,
        password,
        email,
        phone,
        nickname,
        deptId,
        status,
        remark,
      } = params;
      const id = crypto.randomUUID();
      const passwordHash = await passwordHasher.hash(password);

      await executor(
        `INSERT INTO sys_user (id, username, password_hash, email, phone, nickname, dept_id, status, remark, mfa_enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW(), NOW())`,
        [
          id,
          username,
          passwordHash,
          email ?? null,
          phone ?? null,
          nickname ?? null,
          deptId ?? null,
          status ?? 1,
          remark ?? null,
        ],
      );

      // 清除用户列表缓存
      await cache.del("user:list");

      return { id };
    },

    async update(id, params) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const updatableFields: Record<string, unknown> = {
        email: params.email,
        phone: params.phone,
        nickname: params.nickname,
        avatar: params.avatar,
        gender: params.gender,
        dept_id: params.deptId,
        status: params.status,
        remark: params.remark,
      };

      for (const [field, value] of Object.entries(updatableFields)) {
        if (value !== undefined) {
          fields.push(`${field} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) {
        return;
      }

      fields.push(`updated_at = NOW()`);
      values.push(id);

      await executor(
        `UPDATE sys_user SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
        values,
      );

      // 清除用户缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async delete(id) {
      // 软删除
      await executor(
        "UPDATE sys_user SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
        [id],
      );

      // 清除缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async getById(id) {
      // 尝试从缓存获取
      const cached = await cache.get<UserDetail>(`user:detail:${id}`);
      if (cached) return cached;

      const rows = await executor(
        `SELECT id, username, email, phone, nickname, avatar, gender, status, dept_id, mfa_enabled, remark, created_at, updated_at
         FROM sys_user WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      const users = rows as Array<Record<string, unknown>>;

      if (users.length === 0) return null;

      const row = users[0]!;
      const detail: UserDetail = {
        id: row.id as string,
        username: row.username as string,
        email: (row.email as string) ?? null,
        phone: (row.phone as string) ?? null,
        nickname: (row.nickname as string) ?? null,
        avatar: (row.avatar as string) ?? null,
        gender: (row.gender as number) ?? null,
        status: row.status as number,
        deptId: (row.dept_id as string) ?? null,
        mfaEnabled: row.mfa_enabled as boolean,
        remark: (row.remark as string) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };

      // 写入缓存
      await cache.set(`user:detail:${id}`, detail, { ttl: 300 });

      return detail;
    },

    async list(params) {
      const { page = 1, pageSize = 10, username, status, deptId } = params;
      const conditions: string[] = ["deleted_at IS NULL"];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (username) {
        conditions.push(`username LIKE $${paramIndex}`);
        values.push(`%${username}%`);
        paramIndex++;
      }
      if (status !== undefined) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }
      if (deptId) {
        conditions.push(`dept_id = $${paramIndex}`);
        values.push(deptId);
        paramIndex++;
      }

      const whereClause = conditions.join(" AND ");

      // 查询总数
      const countRows = await executor(
        `SELECT COUNT(*) as total FROM sys_user WHERE ${whereClause}`,
        values,
      );
      const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0;

      // 查询分页数据
      const offset = (page - 1) * pageSize;
      const listRows = await executor(
        `SELECT id, username, nickname, email, phone, status, dept_id, created_at
         FROM sys_user WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, pageSize, offset],
      );

      const list = (listRows as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        username: row.username as string,
        nickname: (row.nickname as string) ?? null,
        email: (row.email as string) ?? null,
        phone: (row.phone as string) ?? null,
        status: row.status as number,
        deptId: (row.dept_id as string) ?? null,
        createdAt: row.created_at as string,
      }));

      return { items: list, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async resetPassword(id, newPassword) {
      const passwordHash = await passwordHasher.hash(newPassword);

      await executor(
        "UPDATE sys_user SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        [passwordHash, id],
      );

      // 清除用户缓存
      await cache.del(`user:detail:${id}`);
    },

    async updateStatus(id, status) {
      await executor(
        "UPDATE sys_user SET status = $1, updated_at = NOW() WHERE id = $2",
        [status, id],
      );

      // 清除缓存
      await cache.del(`user:detail:${id}`);
      await cache.del("user:list");
    },

    async export(params) {
      const { username, status, deptId } = params ?? {};
      const conditions: string[] = ["deleted_at IS NULL"];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (username) {
        conditions.push(`username LIKE $${paramIndex}`);
        values.push(`%${username}%`);
        paramIndex++;
      }
      if (status !== undefined) {
        conditions.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }
      if (deptId) {
        conditions.push(`dept_id = $${paramIndex}`);
        values.push(deptId);
        paramIndex++;
      }

      const whereClause = conditions.join(" AND ");
      const rows = await executor(
        `SELECT id, username, nickname, email, phone, status, dept_id, created_at, updated_at
         FROM sys_user WHERE ${whereClause} ORDER BY created_at DESC`,
        values,
      );

      const users = rows as Array<Record<string, unknown>>;

      // 生成 CSV
      const header = "ID,用户名,昵称,邮箱,手机,状态,部门ID,创建时间,更新时间";
      const csvRows = users.map((row) => {
        const escapeCsv = (val: unknown) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        return [
          escapeCsv(row.id),
          escapeCsv(row.username),
          escapeCsv(row.nickname),
          escapeCsv(row.email),
          escapeCsv(row.phone),
          escapeCsv(row.status),
          escapeCsv(row.dept_id),
          escapeCsv(row.created_at),
          escapeCsv(row.updated_at),
        ].join(",");
      });

      return [header, ...csvRows].join("\n");
    },
  };
}
