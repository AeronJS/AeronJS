/**
 * @ventostack/database — 关联定义
 * 提供 hasOne / hasMany / belongsTo / belongsToMany 关联定义与 JOIN / 预加载 SQL 生成
 * 所有关联均基于外键与本地键显式配置，无运行时反射或隐式推断
 */

import type { ModelDefinition } from "./model";

/**
 * 关联类型。
 */
export type RelationType = "hasOne" | "hasMany" | "belongsTo" | "belongsToMany";

/**
 * 关联定义，描述两个模型之间的关联关系。
 */
export interface RelationDefinition {
  /** 关联类型 */
  type: RelationType;
  /** 关联的目标模型 */
  model: ModelDefinition;
  /** 外键字段名（在关联模型或中间表中） */
  foreignKey: string;
  /** 本地键字段名（当前模型中的关联字段，默认 id） */
  localKey: string;
  // belongsToMany 专用字段
  /** 中间表表名（仅 belongsToMany） */
  pivotTable?: string;
  /** 中间表中指向当前模型的外键（仅 belongsToMany） */
  pivotForeignKey?: string;
  /** 中间表中指向关联模型的外键（仅 belongsToMany） */
  pivotRelatedKey?: string;
}

/**
 * 定义模型关联。
 * @param type — 关联类型
 * @param model — 关联目标模型
 * @param options — 关联配置（外键、本地键、中间表等）
 * @returns 关联定义对象
 */
export function defineRelation(
  type: RelationType,
  model: ModelDefinition,
  options: {
    foreignKey: string;
    localKey?: string;
    pivotTable?: string;
    pivotForeignKey?: string;
    pivotRelatedKey?: string;
  },
): RelationDefinition {
  if (type === "belongsToMany") {
    if (!options.pivotTable) {
      throw new Error("belongsToMany requires pivotTable");
    }
    if (!options.pivotForeignKey) {
      throw new Error("belongsToMany requires pivotForeignKey");
    }
    if (!options.pivotRelatedKey) {
      throw new Error("belongsToMany requires pivotRelatedKey");
    }
  }

  const def: RelationDefinition = {
    type,
    model,
    foreignKey: options.foreignKey,
    localKey: options.localKey ?? "id",
  };
  if (options.pivotTable) def.pivotTable = options.pivotTable;
  if (options.pivotForeignKey) def.pivotForeignKey = options.pivotForeignKey;
  if (options.pivotRelatedKey) def.pivotRelatedKey = options.pivotRelatedKey;
  return def;
}

/**
 * 根据关联定义构建 LEFT JOIN SQL 片段。
 * @param baseTable — 基础表名
 * @param relation — 关联定义
 * @param alias — 关联表别名（可选）
 * @returns JOIN SQL 字符串
 */
export function buildJoinSQL(
  baseTable: string,
  relation: RelationDefinition,
  alias?: string,
): string {
  const relatedTable = relation.model.tableName;
  const relatedAlias = alias ?? relatedTable;

  switch (relation.type) {
    case "hasOne":
    case "hasMany":
      // JOIN related ON related.foreignKey = base.localKey
      return `LEFT JOIN ${relatedTable}${alias ? ` AS ${alias}` : ""} ON ${relatedAlias}.${relation.foreignKey} = ${baseTable}.${relation.localKey}`;

    case "belongsTo":
      // JOIN related ON related.localKey = base.foreignKey
      return `LEFT JOIN ${relatedTable}${alias ? ` AS ${alias}` : ""} ON ${relatedAlias}.${relation.localKey} = ${baseTable}.${relation.foreignKey}`;

    case "belongsToMany": {
      const pivot = relation.pivotTable!;
      const pivotFK = relation.pivotForeignKey!;
      const pivotRK = relation.pivotRelatedKey!;
      // JOIN pivot ON pivot.pivotForeignKey = base.localKey
      // JOIN related ON related.localKey = pivot.pivotRelatedKey
      return (
        `LEFT JOIN ${pivot} ON ${pivot}.${pivotFK} = ${baseTable}.${relation.localKey}` +
        ` LEFT JOIN ${relatedTable}${alias ? ` AS ${alias}` : ""} ON ${relatedAlias}.${relation.localKey} = ${pivot}.${pivotRK}`
      );
    }
  }
}

/**
 * 根据关联定义构建预加载（eager load）查询 SQL。
 * @param _baseTable — 基础表名（当前未使用，保留扩展）
 * @param relation — 关联定义
 * @param parentIds — 父模型主键值数组
 * @returns SQL 文本与参数数组
 */
export function buildEagerLoadSQL(
  _baseTable: string,
  relation: RelationDefinition,
  parentIds: unknown[],
): { text: string; params: unknown[] } {
  const relatedTable = relation.model.tableName;
  const params = [...parentIds];
  const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(", ");

  switch (relation.type) {
    case "hasOne":
    case "hasMany":
      // SELECT * FROM related WHERE foreignKey IN ($1, $2, ...)
      return {
        text: `SELECT * FROM ${relatedTable} WHERE ${relation.foreignKey} IN (${placeholders})`,
        params,
      };

    case "belongsTo":
      // SELECT * FROM related WHERE localKey IN ($1, $2, ...)
      return {
        text: `SELECT * FROM ${relatedTable} WHERE ${relation.localKey} IN (${placeholders})`,
        params,
      };

    case "belongsToMany": {
      const pivot = relation.pivotTable!;
      const pivotFK = relation.pivotForeignKey!;
      const pivotRK = relation.pivotRelatedKey!;
      // SELECT related.*, pivot.pivotForeignKey FROM related
      // JOIN pivot ON pivot.pivotRelatedKey = related.localKey
      // WHERE pivot.pivotForeignKey IN ($1, $2, ...)
      return {
        text:
          `SELECT ${relatedTable}.*, ${pivot}.${pivotFK} FROM ${relatedTable}` +
          ` LEFT JOIN ${pivot} ON ${pivot}.${pivotRK} = ${relatedTable}.${relation.localKey}` +
          ` WHERE ${pivot}.${pivotFK} IN (${placeholders})`,
        params,
      };
    }
  }
}
