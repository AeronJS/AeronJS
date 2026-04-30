/**
 * @ventostack/testing - 测试工具包
 *
 * 提供 VentoStack 框架的测试基础设施，包括：
 * - HTTP 测试客户端（createTestClient）
 * - 测试应用生命周期管理（createTestApp）
 * - 数据库事务隔离与自动回滚（createDBIsolation / withTransaction）
 * - 内存测试数据库与 Fixture（createTestDatabase / createTestDatabaseFixture）
 * - 安全回归测试套件（createSecurityTestSuite）
 * - 测试数据工厂（defineFactory / sequence / oneOf / uuid）
 * - Fixture 管理器（createFixtureManager）
 *
 * 所有工具基于 bun:test 设计，强调函数式、显式依赖与测试隔离。
 */

/** 创建测试应用实例 */
export { createTestApp } from "./test-app";
export type { TestAppInstance } from "./test-app";

/** 创建 HTTP 测试客户端 */
export { createTestClient } from "./test-client";
export type { TestClient, TestResponse, RequestOptions } from "./test-client";

/** 定义数据工厂与辅助生成器 */
export { defineFactory, sequence, oneOf, uuid } from "./factory";
export type { FactoryDefinition, Factory } from "./factory";

/** 创建数据库事务隔离与自动回滚工具 */
export { createDBIsolation, withTransaction } from "./db-isolation";
export type { DBIsolationOptions, DBIsolation } from "./db-isolation";

/** 创建安全测试套件 */
export { createSecurityTestSuite } from "./security-test";
export type { SecurityTestSuite } from "./security-test";

/** 创建测试 Fixture 管理器 */
export { createFixtureManager } from "./fixture";
export type { FixtureManager } from "./fixture";

/** 创建测试数据库与测试容器 */
export { createTestDatabase, createTestDatabaseFixture } from "./test-container";
export type { TestDatabase, TestContainerOptions, TestContainerFactory } from "./test-container";
