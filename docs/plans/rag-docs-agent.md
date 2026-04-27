# 方案：基于 @ventostack/ai 构建文档 RAG 智能体

> 状态：待评审  
> 日期：2026-04-24  
> 作者：AI Assistant  

---

## 1. 背景与目标

### 1.1 背景

`@ventostack/ai` 已具备以下基础设施：

- `createKnowledgeBase()` — 内存文档存储、TF-IDF 相似度检索、文本分块
- `createAgentRegistry()` — 智能体配置注册表
- `createContextManager()` — 对话上下文管理（内存）
- `createToolRegistry()` — 工具注册、参数校验、超时执行
- `createSandbox()` — 权限沙箱（工具白名单、网络/文件访问控制）
- `createApprovalManager()` — 敏感工具调用审批流

但缺失三个关键组件：

1. **文档加载器**：将 Markdown 文件系统性地加载到 KnowledgeBase
2. **LLM 调用层**：连接外部大模型 API 生成回答
3. **RAG 执行编排**：将检索 + LLM + 上下文管理组合为可调用智能体

### 1.2 目标

将 `apps/docs/src/content/docs/` 下的全部 Markdown 文档作为知识库，构建一个可通过 HTTP API 或 CLI 交互的 RAG 智能体，能够回答关于 VentoStack 框架的技术问题。

---

## 2. 方案设计

### 2.1 架构

```
┌─────────────────────────────────────────────┐
│  用户提问（HTTP / CLI）                        │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  RAGAgent.chat(message, conversationId?)    │
│  ├─ ContextManager.getHistory()             │
│  ├─ KnowledgeBase.search(query, topK)       │
│  ├─ 组装 Prompt（system + context + history + query）│
│  ├─ LLMClient.chat(messages)                │
│  ├─ ContextManager.addMessage()             │
│  └─ 返回 { answer, sources, conversationId } │
└─────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  初始化流水线                                │
│  loadDocumentsFromDirectory(dir, kb)        │
│  ├─ Bun.glob() 遍历 *.md                    │
│  ├─ 解析 frontmatter（title, description）   │
│  ├─ kb.chunk() 分块                         │
│  └─ kb.add() 存入知识库                      │
└─────────────────────────────────────────────┘
```

### 2.2 新增文件

```
packages/ai/src/
├── document-loader.ts          # 新增：文档加载与解析
├── llm.ts                      # 新增：OpenAI 兼容 LLM 客户端
├── rag-agent.ts                # 新增：RAG 智能体执行编排
├── __tests__/
│   ├── document-loader.test.ts # 新增
│   ├── llm.test.ts             # 新增（mock 模式）
│   └── rag-agent.test.ts       # 新增
└── index.ts                    # 修改：导出新增模块

apps/example/                   # 或新建 apps/rag-demo/
├── src/
│   └── rag-server.ts           # 新增：HTTP API 示例
```

### 2.3 核心接口设计

#### document-loader.ts

```typescript
export interface DocumentLoaderOptions {
  chunkSize?: number;
  overlap?: number;
  separator?: string;
  includePattern?: RegExp;
}

export interface LoadedDocument {
  id: string;
  content: string;
  metadata: {
    source: string;
    title?: string;
    description?: string;
    category?: string;
  };
}

export interface LoadResult {
  loaded: number;
  chunks: number;
  errors: string[];
}

export async function loadDocumentsFromDirectory(
  dirPath: string,
  kb: KnowledgeBase,
  options?: DocumentLoaderOptions,
): Promise<LoadResult>;

export function parseMarkdownFrontmatter(content: string): {
  data: Record<string, string>;
  body: string;
};
```

**设计原则：**
- 使用 `Bun.file()` + `Bun.glob()` 读取文件，零额外依赖
- frontmatter 仅解析简单键值对（当前文档只用 `title` / `description`）
- 长文档自动分块，每块保留 `source` / `title` / `category` 元数据
- 错误不中断，汇总后返回

#### llm.ts

```typescript
export interface LLMClientOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClient {
  chat(messages: ChatMessage[]): Promise<string>;
}

export function createLLMClient(options: LLMClientOptions): LLMClient;
```

**设计原则：**
- 函数式工厂，无 class
- OpenAI 兼容 API 格式（`/v1/chat/completions`）
- 超时控制（默认 30s）
- 生产启动前拒绝空 API key
- 支持流式响应预留接口（后续扩展）

#### rag-agent.ts

```typescript
export interface RAGAgentConfig {
  name: string;
  systemPrompt: string;
  topK?: number;
  maxHistory?: number;
}

export interface RAGAgentDeps {
  knowledgeBase: KnowledgeBase;
  contextManager: ContextManager;
  llmClient: LLMClient;
  toolRegistry?: ToolRegistry;
  sandbox?: Sandbox;
}

export interface RAGChatResult {
  answer: string;
  sources: Array<{
    id: string;
    score: number;
    title: string;
    excerpt: string;
  }>;
  conversationId: string;
}

export interface RAGAgent {
  readonly name: string;
  readonly systemPrompt: string;
  chat(message: string, conversationId?: string): Promise<RAGChatResult>;
}

export function createRAGAgent(deps: RAGAgentDeps, config: RAGAgentConfig): RAGAgent;
```

**执行流程：**

1. 若未提供 `conversationId`，`ContextManager.create()` 新建会话
2. `ContextManager.addMessage()` 记录用户问题
3. `KnowledgeBase.search(message, topK)` 检索相关 chunks
4. 组装 prompt：
   ```
   system: {systemPrompt}
   user: 基于以下文档片段回答问题：
         ---
         [chunk1]
         [chunk2]
         ---
         问题：{message}
   ```
5. `LLMClient.chat()` 生成回答
6. `ContextManager.addMessage()` 记录助手回答
7. 返回结果 + sources（含 score、title、excerpt）

---

## 3. 依赖分析

### 3.1 新增外部依赖

| 依赖 | 用途 | 必要性分析 | 结论 |
|------|------|------------|------|
| `gray-matter` | YAML frontmatter 解析 | 当前文档 frontmatter 只有简单键值对，可用正则替代 | **不引入** |
| `openai` | OpenAI SDK | 框架追求轻量，用原生 `fetch` 即可 | **不引入** |

**结论：零新增外部依赖**，全部用 Bun 内置能力实现。

### 3.2 现有依赖复用

- `@ventostack/core` — 路由/Context（HTTP 示例用）
- `ajv` — 已用于工具参数校验

---

## 4. 安全基线

### 4.1 AI 边界

- Tool Registry 中注册的文档查询工具仅限 `search` 操作，禁止任意文件读写
- Sandbox 限制 `allowedHosts` 仅 LLM API 域名
- 审批流：高风险工具（如修改文档）需人工审批

### 4.2 信息泄露防护

- LLM API key 仅通过环境变量传入，不落地代码
- 错误日志不输出 API key、不输出完整 prompt
- 生产环境 `/docs/chat` 端点需认证（示例中展示中间件位置）

### 4.3 输入校验

- 用户提问限制长度（默认 4000 字符）
- `topK` 限制范围（1-20）
- `conversationId` 必须是有效 UUID

---

## 5. 测试策略

| 测试文件 | 覆盖内容 |
|----------|----------|
| `document-loader.test.ts` | 目录遍历、frontmatter 解析、分块策略、错误处理、元数据保留 |
| `llm.test.ts` | mock fetch 测试请求构造、超时、错误处理、key 缺失拒绝 |
| `rag-agent.test.ts` | mock LLM + mock KB 的端到端流程、上下文连续性、source 追溯 |

**测试原则：**
- LLM 调用使用 mock，不依赖真实 API
- 文档加载使用临时文件（`Bun.write()` + 清理）
- 所有测试通过 `bun:test` 执行

---

## 6. 演进路径

### 阶段 1（本期）：纯内存 TF-IDF
- 使用现有 `KnowledgeBase` 的 TF-IDF 检索
- 零外部向量依赖，启动即用
- 适用场景：文档量 < 1000 chunks、英文/简单中文关键词匹配

### 阶段 2（后续）：Embedding 语义检索
- 预计算 `Document.embedding`（OpenAI text-embedding-3-small / BGE）
- 将 `KnowledgeBase.search()` 替换为向量余弦相似度
- 支持语义匹配（如 "路由系统" 匹配 "如何定义 HTTP endpoint"）

### 阶段 3（后续）：持久化与多实例
- `ContextManager` 外接 Redis（会话共享）
- `KnowledgeBase` 接入 pgvector / Qdrant
- 支持水平扩展

---

## 7. 交付物

### 7.1 代码

- [ ] `packages/ai/src/document-loader.ts`
- [ ] `packages/ai/src/llm.ts`
- [ ] `packages/ai/src/rag-agent.ts`
- [ ] `packages/ai/src/index.ts`（更新导出）
- [ ] `packages/ai/src/__tests__/document-loader.test.ts`
- [ ] `packages/ai/src/__tests__/llm.test.ts`
- [ ] `packages/ai/src/__tests__/rag-agent.test.ts`
- [ ] `apps/example/src/rag-server.ts`（HTTP API 示例）

### 7.2 验证项

- [ ] `bun test` 全部通过
- [ ] `bun run typecheck` 无错误
- [ ] 本地启动示例服务后能正确回答文档相关问题

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| TF-IDF 对中文检索精度有限 | 回答相关性下降 | 本期接受限制，阶段 2 接入 Embedding |
| LLM API 调用失败/超时 | 服务不可用 | 超时控制 + 降级返回 "检索结果 + 请稍后再试" |
| 文档更新后知识库不同步 | 回答过时 | 示例中加入手动 reload 端点，长期可用文件监听 |
| 长文档分块破坏上下文 | 检索片段语义不完整 | overlap 参数 + 合理 chunkSize（800-1000） |

---

## 9. 参考

- [CLAUDE.md](/CLAUDE.md) — 框架架构与安全基线
- [packages/ai/src/rag.ts](/packages/ai/src/rag.ts) — 现有知识库实现
- [apps/docs/src/content/docs/ai/rag.md](/apps/docs/src/content/docs/ai/rag.md) — 现有 RAG 文档
