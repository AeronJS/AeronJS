/**
 * @ventostack/ai — AI 模块公共入口
 *
 * 提供 AI 工具注册表、权限沙箱、审批流、上下文管理、RAG 知识库与智能体注册表等能力。
 */

export { createToolRegistry } from "./tool-registry";
export type {
  /** 工具参数定义 */
  ToolParameter,
  /** 工具定义 */
  ToolDefinition,
  /** 工具执行结果 */
  ToolExecutionResult,
  /** 工具注册表 */
  ToolRegistry,
} from "./tool-registry";

export { createSandbox } from "./sandbox";
export type {
  /** 沙箱权限配置 */
  SandboxPermissions,
  /** 沙箱实例 */
  Sandbox,
} from "./sandbox";

export { createApprovalManager } from "./approval";
export type {
  /** 审批状态 */
  ApprovalStatus,
  /** 审批请求 */
  ApprovalRequest,
  /** 审批管理器选项 */
  ApprovalOptions,
  /** 审批管理器 */
  ApprovalManager,
} from "./approval";

export { createContextManager } from "./context";
export type {
  /** 对话消息 */
  ConversationMessage,
  /** 对话上下文 */
  ConversationContext,
  /** 上下文管理器 */
  ContextManager,
} from "./context";

export { createKnowledgeBase, createAgentRegistry } from "./rag";
export type {
  /** 文档 */
  Document,
  /** 文本分块选项 */
  ChunkOptions,
  /** 搜索结果 */
  SearchResult,
  /** 知识库 */
  KnowledgeBase,
  /** 智能体配置 */
  AgentConfig,
  /** 智能体注册表 */
  AgentRegistry,
} from "./rag";
