/**
 * @ventostack/system - 字典服务
 * 提供字典类型与字典数据的 CRUD，带缓存策略
 */

import type { SqlExecutor } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 字典类型创建参数 */
export interface CreateDictTypeParams {
  name: string;
  code: string;
  remark?: string;
}

/** 字典类型更新参数 */
export interface UpdateDictTypeParams {
  name?: string;
  status?: number;
  remark?: string;
}

/** 字典类型列表项 */
export interface DictTypeItem {
  id: string;
  name: string;
  code: string;
  status: number;
  remark: string;
}

/** 字典数据创建参数 */
export interface CreateDictDataParams {
  typeCode: string;
  label: string;
  value: string;
  sort?: number;
  cssClass?: string;
}

/** 字典数据更新参数 */
export interface UpdateDictDataParams {
  label?: string;
  value?: string;
  sort?: number;
  cssClass?: string;
  status?: number;
  remark?: string;
}

/** 字典数据列表项 */
export interface DictDataItem {
  id: string;
  typeCode: string;
  label: string;
  value: string;
  sort: number;
  cssClass: string;
  status: number;
  remark: string;
}

/** 字典服务接口 */
export interface DictService {
  /** 创建字典类型 */
  createType(params: CreateDictTypeParams): Promise<{ id: string }>;
  /** 更新字典类型 */
  updateType(code: string, params: UpdateDictTypeParams): Promise<void>;
  /** 删除字典类型 */
  deleteType(code: string): Promise<void>;
  /** 分页查询字典类型 */
  listTypes(params?: { page?: number; pageSize?: number }): Promise<PaginatedResult<DictTypeItem>>;

  /** 创建字典数据 */
  createData(params: CreateDictDataParams): Promise<{ id: string }>;
  /** 更新字典数据 */
  updateData(id: string, params: UpdateDictDataParams): Promise<void>;
  /** 删除字典数据 */
  deleteData(id: string): Promise<void>;
  /** 按字典类型查询字典数据（带缓存） */
  listDataByType(typeCode: string): Promise<DictDataItem[]>;
  /** 刷新字典缓存 */
  refreshCache(typeCode?: string): Promise<void>;
}

/**
 * 创建字典服务实例
 * @param deps 依赖注入
 * @returns DictService 实例
 */
export function createDictService(deps: { executor: SqlExecutor; cache: Cache }): DictService {
  const { executor, cache } = deps;

  function cacheKey(typeCode: string): string {
    return `dict:${typeCode}`;
  }

  // ===== 字典类型 =====

  async function createType(params: CreateDictTypeParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await executor(
      `INSERT INTO sys_dict_type (id, name, code, status, remark) VALUES ($1, $2, $3, 1, $4)`,
      [id, params.name, params.code, params.remark ?? null],
    );
    return { id };
  }

  async function updateType(code: string, params: UpdateDictTypeParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(params.name);
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

    values.push(code);
    await executor(
      `UPDATE sys_dict_type SET ${sets.join(", ")} WHERE code = $${idx}`,
      values,
    );

    // 类型变更后刷新对应字典数据缓存
    await refreshCache(code);
  }

  async function deleteType(code: string): Promise<void> {
    await executor(`DELETE FROM sys_dict_data WHERE type_code = $1`, [code]);
    await executor(`DELETE FROM sys_dict_type WHERE code = $1`, [code]);
    await cache.del(cacheKey(code));
  }

  async function listTypes(params?: { page?: number; pageSize?: number }): Promise<PaginatedResult<DictTypeItem>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const countRows = await executor(
      `SELECT COUNT(*) AS total FROM sys_dict_type`,
    ) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await executor(
      `SELECT id, name, code, status, COALESCE(remark, '') AS remark FROM sys_dict_type ORDER BY id ASC LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    ) as Array<Record<string, unknown>>;

    const items: DictTypeItem[] = rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      code: row.code as string,
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

  // ===== 字典数据 =====

  async function createData(params: CreateDictDataParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await executor(
      `INSERT INTO sys_dict_data (id, type_code, label, value, sort, css_class, status, remark) VALUES ($1, $2, $3, $4, $5, $6, 1, NULL)`,
      [
        id,
        params.typeCode,
        params.label,
        params.value,
        params.sort ?? 0,
        params.cssClass ?? null,
      ],
    );
    // 新增数据后使缓存失效
    await cache.del(cacheKey(params.typeCode));
    return { id };
  }

  async function updateData(id: string, params: UpdateDictDataParams): Promise<void> {
    // 先查出当前记录的 type_code 以便刷新缓存
    const existing = await executor(
      `SELECT type_code FROM sys_dict_data WHERE id = $1`,
      [id],
    ) as Array<Record<string, unknown>>;

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.label !== undefined) {
      sets.push(`label = $${idx++}`);
      values.push(params.label);
    }
    if (params.value !== undefined) {
      sets.push(`value = $${idx++}`);
      values.push(params.value);
    }
    if (params.sort !== undefined) {
      sets.push(`sort = $${idx++}`);
      values.push(params.sort);
    }
    if (params.cssClass !== undefined) {
      sets.push(`css_class = $${idx++}`);
      values.push(params.cssClass);
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
      `UPDATE sys_dict_data SET ${sets.join(", ")} WHERE id = $${idx}`,
      values,
    );

    // 刷新关联的字典类型缓存
    const typeCode = existing[0]?.type_code as string | undefined;
    if (typeCode) {
      await cache.del(cacheKey(typeCode));
    }
  }

  async function deleteData(id: string): Promise<void> {
    // 先查出当前记录的 type_code 以便刷新缓存
    const existing = await executor(
      `SELECT type_code FROM sys_dict_data WHERE id = $1`,
      [id],
    ) as Array<Record<string, unknown>>;

    await executor(`DELETE FROM sys_dict_data WHERE id = $1`, [id]);

    const typeCode = existing[0]?.type_code as string | undefined;
    if (typeCode) {
      await cache.del(cacheKey(typeCode));
    }
  }

  async function queryDataByType(typeCode: string): Promise<DictDataItem[]> {
    const rows = await executor(
      `SELECT id, type_code, label, value, sort, COALESCE(css_class, '') AS css_class, status, COALESCE(remark, '') AS remark FROM sys_dict_data WHERE type_code = $1 AND status = 1 ORDER BY sort ASC, id ASC`,
      [typeCode],
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as string,
      typeCode: row.type_code as string,
      label: row.label as string,
      value: row.value as string,
      sort: (row.sort as number) ?? 0,
      cssClass: (row.css_class as string) ?? "",
      status: (row.status as number) ?? 1,
      remark: (row.remark as string) ?? "",
    }));
  }

  async function listDataByType(typeCode: string): Promise<DictDataItem[]> {
    return cache.remember<DictDataItem[]>(cacheKey(typeCode), 3600, () =>
      queryDataByType(typeCode),
    );
  }

  async function refreshCache(typeCode?: string): Promise<void> {
    if (typeCode) {
      await cache.del(cacheKey(typeCode));
      // 预热缓存
      await queryDataByType(typeCode);
    } else {
      // 刷新所有 dict:* 缓存
      const keys = await cache.get<string[]>("dict:*");
      // 通过 keys() 获取所有 dict: 前缀的键并逐一删除
      const adapter = (cache as unknown as { keys?: (pattern: string) => Promise<string[]> }).keys;
      if (adapter && typeof adapter === "function") {
        const allKeys = await adapter("dict:*");
        for (const key of allKeys) {
          await cache.del(key);
        }
      }
    }
  }

  return {
    createType,
    updateType,
    deleteType,
    listTypes,
    createData,
    updateData,
    deleteData,
    listDataByType,
    refreshCache,
  };
}
