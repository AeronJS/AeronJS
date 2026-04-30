/**
 * @ventostack/observability - 审计日志查询与导出
 * 提供审计日志的 CSV/JSON Lines 格式导出，以及分页查询能力
 * 适用于审计报告生成、合规检查与离线分析场景
 */

import type { AuditEntry, AuditStore } from "./audit";

export interface AuditExporter {
  /** 导出为 CSV 字符串 */
  toCSV(entries: AuditEntry[]): string;
  /** 导出为 JSON Lines 格式 */
  toJSONL(entries: AuditEntry[]): string;
  /** 分页查询 */
  queryPaginated(
    store: AuditStore,
    filter: {
      actor?: string;
      action?: string;
      resource?: string;
      from?: number;
      to?: number;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ entries: AuditEntry[]; total: number; page: number; pageSize: number }>;
}

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function createAuditExporter(): AuditExporter {
  return {
    toCSV(entries) {
      const headers = [
        "id",
        "timestamp",
        "actor",
        "action",
        "resource",
        "resourceId",
        "result",
        "hash",
      ];
      const lines = [headers.join(",")];

      for (const entry of entries) {
        const row = [
          escapeCSVField(entry.id),
          new Date(entry.timestamp).toISOString(),
          escapeCSVField(entry.actor),
          escapeCSVField(entry.action),
          escapeCSVField(entry.resource),
          escapeCSVField(entry.resourceId ?? ""),
          entry.result,
          entry.hash,
        ];
        lines.push(row.join(","));
      }

      return lines.join("\n");
    },

    toJSONL(entries) {
      return entries.map((e) => JSON.stringify(e)).join("\n");
    },

    async queryPaginated(store, filter) {
      const page = filter.page ?? 1;
      const pageSize = filter.pageSize ?? 50;

      // 获取全部匹配记录
      const q: Record<string, string | number> = {};
      if (filter.actor) q.actor = filter.actor;
      if (filter.action) q.action = filter.action;
      if (filter.resource) q.resource = filter.resource;
      if (filter.from !== undefined) q.from = filter.from;
      if (filter.to !== undefined) q.to = filter.to;
      const all = await store.query(q);

      const total = all.length;
      const start = (page - 1) * pageSize;
      const entries = all.slice(start, start + pageSize);

      return { entries, total, page, pageSize };
    },
  };
}
