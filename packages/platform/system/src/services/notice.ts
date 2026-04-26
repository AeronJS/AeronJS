/**
 * @ventostack/system - 通知公告服务
 * 提供通知公告的 CRUD、发布/撤回、已读标记与未读计数
 */

import type { SqlExecutor } from "@ventostack/database";

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 通知创建参数 */
export interface CreateNoticeParams {
  title: string;
  content: string;
  type: number;
}

/** 通知更新参数 */
export interface UpdateNoticeParams {
  title?: string;
  content?: string;
  type?: number;
  status?: number;
}

/** 通知列表项 */
export interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: number;
  status: number;
  publisherId: string;
  publishAt: string | null;
}

/** 通知列表查询参数 */
export interface NoticeListParams {
  page?: number;
  pageSize?: number;
  type?: number;
  status?: number;
}

/** 通知服务接口 */
export interface NoticeService {
  /** 创建通知 */
  create(params: CreateNoticeParams): Promise<{ id: string }>;
  /** 更新通知 */
  update(id: string, params: UpdateNoticeParams): Promise<void>;
  /** 删除通知（软删除） */
  delete(id: string): Promise<void>;
  /** 分页查询通知列表 */
  list(params?: NoticeListParams): Promise<PaginatedResult<NoticeItem>>;
  /** 发布通知 */
  publish(id: string, publisherId: string): Promise<void>;
  /** 撤回通知 */
  revoke(id: string): Promise<void>;
  /** 标记通知已读 */
  markRead(userId: string, noticeId: string): Promise<void>;
  /** 获取用户未读通知数 */
  getUnreadCount(userId: string): Promise<number>;
}

/**
 * 创建通知公告服务实例
 * @param deps 依赖注入
 * @returns NoticeService 实例
 */
export function createNoticeService(deps: { executor: SqlExecutor }): NoticeService {
  const { executor } = deps;

  async function create(params: CreateNoticeParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await executor(
      `INSERT INTO sys_notice (id, title, content, type, status, publisher_id, publish_at, deleted_at) VALUES ($1, $2, $3, $4, 0, NULL, NULL, NULL)`,
      [id, params.title, params.content, params.type],
    );
    return { id };
  }

  async function update(id: string, params: UpdateNoticeParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(params.title);
    }
    if (params.content !== undefined) {
      sets.push(`content = $${idx++}`);
      values.push(params.content);
    }
    if (params.type !== undefined) {
      sets.push(`type = $${idx++}`);
      values.push(params.type);
    }
    if (params.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(params.status);
    }

    if (sets.length === 0) return;

    values.push(id);
    await executor(
      `UPDATE sys_notice SET ${sets.join(", ")} WHERE id = $${idx} AND deleted_at IS NULL`,
      values,
    );
  }

  async function deleteNotice(id: string): Promise<void> {
    const now = new Date().toISOString();
    await executor(
      `UPDATE sys_notice SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [now, id],
    );
  }

  async function list(params?: NoticeListParams): Promise<PaginatedResult<NoticeItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["deleted_at IS NULL"];
    const values: unknown[] = [];
    let idx = 1;

    if (params?.type !== undefined) {
      conditions.push(`type = $${idx++}`);
      values.push(params.type);
    }
    if (params?.status !== undefined) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    const where = conditions.join(" AND ");

    const countRows = await executor(
      `SELECT COUNT(*) AS total FROM sys_notice WHERE ${where}`,
      values,
    ) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await executor(
      `SELECT id, title, content, type, status, publisher_id, publish_at FROM sys_notice WHERE ${where} ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset],
    ) as Array<Record<string, unknown>>;

    const items: NoticeItem[] = rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      type: (row.type as number) ?? 1,
      status: (row.status as number) ?? 0,
      publisherId: (row.publisher_id as string) ?? "",
      publishAt: row.publish_at ? String(row.publish_at) : null,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async function publish(id: string, publisherId: string): Promise<void> {
    const now = new Date().toISOString();
    await executor(
      `UPDATE sys_notice SET status = 1, publisher_id = $1, publish_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      [publisherId, now, id],
    );
  }

  async function revoke(id: string): Promise<void> {
    await executor(
      `UPDATE sys_notice SET status = 2, publish_at = NULL WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async function markRead(userId: string, noticeId: string): Promise<void> {
    const now = new Date().toISOString();
    await executor(
      `INSERT INTO sys_user_notice (user_id, notice_id, read_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, noticeId, now],
    );
  }

  async function getUnreadCount(userId: string): Promise<number> {
    const rows = await executor(
      `SELECT COUNT(*) AS cnt FROM sys_notice n WHERE n.deleted_at IS NULL AND n.status = 1 AND NOT EXISTS (SELECT 1 FROM sys_user_notice un WHERE un.user_id = $1 AND un.notice_id = n.id)`,
      [userId],
    ) as Array<Record<string, unknown>>;
    return Number(rows[0]?.cnt ?? 0);
  }

  return {
    create,
    update,
    delete: deleteNotice,
    list,
    publish,
    revoke,
    markRead,
    getUnreadCount,
  };
}
