/**
 * @ventostack/system - 岗位服务
 * 提供岗位的 CRUD 与分页查询
 */

import type { SqlExecutor } from "@ventostack/database";

/** 岗位创建参数 */
export interface CreatePostParams {
  name: string;
  code: string;
  sort?: number;
  remark?: string;
}

/** 岗位更新参数 */
export interface UpdatePostParams {
  name?: string;
  code?: string;
  sort?: number;
  status?: number;
  remark?: string;
}

/** 岗位列表项 */
export interface PostItem {
  id: string;
  name: string;
  code: string;
  sort: number;
  status: number;
  remark: string;
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 岗位列表查询参数 */
export interface PostListParams {
  page?: number;
  pageSize?: number;
  status?: number;
}

/** 岗位服务接口 */
export interface PostService {
  /** 创建岗位 */
  create(params: CreatePostParams): Promise<{ id: string }>;
  /** 更新岗位 */
  update(id: string, params: UpdatePostParams): Promise<void>;
  /** 删除岗位（软删除） */
  delete(id: string): Promise<void>;
  /** 分页查询岗位列表 */
  list(params?: PostListParams): Promise<PaginatedResult<PostItem>>;
}

/**
 * 创建岗位服务实例
 * @param deps 依赖注入
 * @returns PostService 实例
 */
export function createPostService(deps: { executor: SqlExecutor }): PostService {
  const { executor } = deps;

  async function create(params: CreatePostParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await executor(
      `INSERT INTO sys_post (id, name, code, sort, status, remark, deleted_at) VALUES ($1, $2, $3, $4, 1, $5, NULL)`,
      [id, params.name, params.code, params.sort ?? 0, params.remark ?? null],
    );
    return { id };
  }

  async function update(id: string, params: UpdatePostParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(params.name);
    }
    if (params.code !== undefined) {
      sets.push(`code = $${idx++}`);
      values.push(params.code);
    }
    if (params.sort !== undefined) {
      sets.push(`sort = $${idx++}`);
      values.push(params.sort);
    }
    if (params.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(params.status);
    }
    if (params.remark !== undefined) {
      sets.push(`remark = $${idx++}`);
      values.push(params.remark);
    }

    if (sets.length === 0) return;

    values.push(id);
    await executor(
      `UPDATE sys_post SET ${sets.join(", ")} WHERE id = $${idx} AND deleted_at IS NULL`,
      values,
    );
  }

  async function deletePost(id: string): Promise<void> {
    const now = new Date().toISOString();
    await executor(
      `UPDATE sys_post SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [now, id],
    );
  }

  async function list(params?: PostListParams): Promise<PaginatedResult<PostItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["deleted_at IS NULL"];
    const values: unknown[] = [];
    let idx = 1;

    if (params?.status !== undefined) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    const where = conditions.join(" AND ");

    const countRows = await executor(
      `SELECT COUNT(*) AS total FROM sys_post WHERE ${where}`,
      values,
    ) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await executor(
      `SELECT id, name, code, sort, status, COALESCE(remark, '') AS remark FROM sys_post WHERE ${where} ORDER BY sort ASC, id ASC LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset],
    ) as Array<Record<string, unknown>>;

    const items: PostItem[] = rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      code: row.code as string,
      sort: (row.sort as number) ?? 0,
      status: (row.status as number) ?? 1,
      remark: (row.remark as string) ?? "",
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  return { create, update, delete: deletePost, list };
}
