/**
 * @ventostack/testing - 数据库测试隔离
 * 提供事务隔离、保存点管理与测试生命周期钩子，实现测试间数据自动回滚
 */

/** 数据库隔离配置选项 */
export interface DBIsolationOptions {
  /** SQL 执行器，用于发送 BEGIN / ROLLBACK / SAVEPOINT 等命令
   * @param sql 要执行的 SQL 字符串 */
  executor: (sql: string) => Promise<void>;
}

/** 数据库事务隔离接口，支持事务与保存点 */
export interface DBIsolation {
  /** 开启新事务（发送 BEGIN） */
  begin(): Promise<void>;
  /** 回滚当前事务（发送 ROLLBACK） */
  rollback(): Promise<void>;
  /** 创建保存点
   * @param name 保存点名称，仅允许字母、数字和下划线 */
  savepoint(name: string): Promise<void>;
  /** 回滚到指定保存点
   * @param name 保存点名称 */
  rollbackTo(name: string): Promise<void>;
}

/** 校验保存点名称合法性
 * @param name 保存点名称
 * @throws 名称非法时抛出 Error */
function validateSavepointName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid savepoint name: "${name}". Only alphanumeric characters and underscores are allowed.`,
    );
  }
}

/** 创建数据库隔离工具
 * @param options 配置选项，包含 SQL 执行器
 * @returns DBIsolation 实例 */
export function createDBIsolation(options: DBIsolationOptions): DBIsolation {
  const { executor } = options;

  return {
    async begin() {
      await executor("BEGIN");
    },
    async rollback() {
      await executor("ROLLBACK");
    },
    async savepoint(name: string) {
      validateSavepointName(name);
      await executor(`SAVEPOINT ${name}`);
    },
    async rollbackTo(name: string) {
      validateSavepointName(name);
      await executor(`ROLLBACK TO SAVEPOINT ${name}`);
    },
  };
}

/** 创建事务生命周期钩子（beforeEach / afterEach），用于测试框架自动回滚
 * @param executor SQL 执行器
 * @returns 包含 beforeEach 和 afterEach 的对象，可在测试框架中直接解构使用 */
export function withTransaction(executor: (sql: string) => Promise<void>): {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
} {
  const isolation = createDBIsolation({ executor });

  return {
    beforeEach: () => isolation.begin(),
    afterEach: () => isolation.rollback(),
  };
}
