/**
 * @ventostack/database — 自动检测 Schema 差异
 * 提供表/列的增删改检测与迁移 SQL 生成能力
 * 支持对比当前数据库 Schema 与目标 Schema，生成 up / down 双向迁移 SQL
 */

/**
 * 列结构定义。
 */
export interface ColumnSchema {
  /** 列名 */
  name: string;
  /** 数据库类型 */
  type: string;
  /** 是否允许为空 */
  nullable?: boolean;
  /** 默认值（字符串形式） */
  defaultValue?: string;
  /** 是否为主键 */
  primaryKey?: boolean;
}

/**
 * 表结构定义。
 */
export interface TableSchema {
  /** 表名 */
  name: string;
  /** 列定义数组 */
  columns: ColumnSchema[];
}

/**
 * Schema 差异结果。
 */
export interface SchemaDiff {
  /** 新增的表名列表 */
  addedTables: string[];
  /** 移除的表名列表 */
  removedTables: string[];
  /** 发生变更的表差异列表 */
  modifiedTables: TableDiff[];
}

/**
 * 单表差异详情。
 */
export interface TableDiff {
  /** 表名 */
  table: string;
  /** 新增的列 */
  addedColumns: ColumnSchema[];
  /** 移除的列名 */
  removedColumns: string[];
  /** 发生变更的列差异 */
  modifiedColumns: ColumnDiff[];
}

/**
 * 单列差异详情。
 */
export interface ColumnDiff {
  /** 列名 */
  column: string;
  /** 变更项列表（如 type、nullable、default） */
  changes: string[];
  /** 变更前的值 */
  from: Partial<ColumnSchema>;
  /** 变更后的值 */
  to: Partial<ColumnSchema>;
}

/**
 * 比较两个 Schema 的差异。
 * @param current — 当前数据库 Schema
 * @param target — 目标 Schema（如代码定义）
 * @returns SchemaDiff 差异对象
 */
export function diffSchemas(current: TableSchema[], target: TableSchema[]): SchemaDiff {
  const currentNames = new Set(current.map((t) => t.name));
  const targetNames = new Set(target.map((t) => t.name));

  const addedTables = target.filter((t) => !currentNames.has(t.name)).map((t) => t.name);
  const removedTables = current.filter((t) => !targetNames.has(t.name)).map((t) => t.name);
  const modifiedTables: TableDiff[] = [];

  for (const targetTable of target) {
    const currentTable = current.find((t) => t.name === targetTable.name);
    if (!currentTable) continue;

    const diff = diffTable(currentTable, targetTable);
    if (
      diff.addedColumns.length > 0 ||
      diff.removedColumns.length > 0 ||
      diff.modifiedColumns.length > 0
    ) {
      modifiedTables.push(diff);
    }
  }

  return { addedTables, removedTables, modifiedTables };
}

/**
 * 比较两张表的列差异。
 * @param current — 当前表结构
 * @param target — 目标表结构
 * @returns TableDiff 差异对象
 */
function diffTable(current: TableSchema, target: TableSchema): TableDiff {
  const currentCols = new Map(current.columns.map((c) => [c.name, c]));
  const targetCols = new Map(target.columns.map((c) => [c.name, c]));

  const addedColumns = target.columns.filter((c) => !currentCols.has(c.name));
  const removedColumns = current.columns.filter((c) => !targetCols.has(c.name)).map((c) => c.name);
  const modifiedColumns: ColumnDiff[] = [];

  for (const [name, targetCol] of targetCols) {
    const currentCol = currentCols.get(name);
    if (!currentCol) continue;

    const changes: string[] = [];
    const from: Partial<ColumnSchema> = {};
    const to: Partial<ColumnSchema> = {};

    if (currentCol.type !== targetCol.type) {
      changes.push("type");
      from.type = currentCol.type;
      to.type = targetCol.type;
    }
    if ((currentCol.nullable ?? true) !== (targetCol.nullable ?? true)) {
      changes.push("nullable");
      if (currentCol.nullable !== undefined) from.nullable = currentCol.nullable;
      if (targetCol.nullable !== undefined) to.nullable = targetCol.nullable;
    }
    if (currentCol.defaultValue !== targetCol.defaultValue) {
      changes.push("default");
      if (currentCol.defaultValue !== undefined) from.defaultValue = currentCol.defaultValue;
      if (targetCol.defaultValue !== undefined) to.defaultValue = targetCol.defaultValue;
    }

    if (changes.length > 0) {
      modifiedColumns.push({ column: name, changes, from, to });
    }
  }

  return { table: target.name, addedColumns, removedColumns, modifiedColumns };
}

/**
 * 从 Schema 差异生成迁移 SQL（up / down）。
 * @param diff — Schema 差异结果
 * @returns up 与 down 两个方向的 SQL 数组
 */
export function generateMigrationSQL(diff: SchemaDiff): { up: string[]; down: string[] } {
  const up: string[] = [];
  const down: string[] = [];

  for (const table of diff.addedTables) {
    up.push(`-- CREATE TABLE ${table} (define columns here)`);
    down.push(`DROP TABLE IF EXISTS ${table};`);
  }

  for (const table of diff.removedTables) {
    up.push(`DROP TABLE IF EXISTS ${table};`);
    down.push(`-- CREATE TABLE ${table} (restore columns here)`);
  }

  for (const mod of diff.modifiedTables) {
    for (const col of mod.addedColumns) {
      up.push(
        `ALTER TABLE ${mod.table} ADD COLUMN ${col.name} ${col.type}${col.nullable === false ? " NOT NULL" : ""}${col.defaultValue ? ` DEFAULT ${col.defaultValue}` : ""};`,
      );
      down.push(`ALTER TABLE ${mod.table} DROP COLUMN ${col.name};`);
    }

    for (const col of mod.removedColumns) {
      up.push(`ALTER TABLE ${mod.table} DROP COLUMN ${col};`);
      down.push(`-- ALTER TABLE ${mod.table} ADD COLUMN ${col} (restore type here);`);
    }

    for (const col of mod.modifiedColumns) {
      if (col.to.type) {
        up.push(`ALTER TABLE ${mod.table} ALTER COLUMN ${col.column} TYPE ${col.to.type};`);
        down.push(`ALTER TABLE ${mod.table} ALTER COLUMN ${col.column} TYPE ${col.from.type};`);
      }
    }
  }

  return { up, down };
}
