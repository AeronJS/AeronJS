/**
 * RAG 问答 API Endpoint（支持 SSE 流式响应）
 *
 * 部署到 Cloudflare Workers 时使用 Workers AI（免费）。
 * 本地开发时回退到 OPENAI_API_KEY 配置的外部 LLM。
 */

import type { APIRoute } from "astro";
import { createKnowledgeBase } from "@ventostack/ai";
import kbDataRaw from "./kb-data.json";

export const prerender = false;

/** Cloudflare Workers AI 模型 */
const WORKERS_AI_MODEL = "@cf/meta/llama-3-8b-instruct";

// 重建知识库（防御性处理：某些打包器可能将 JSON 包装为 { default: [...] }）
const kbData = Array.isArray(kbDataRaw)
  ? kbDataRaw
  : (kbDataRaw as unknown as { default?: unknown[] }).default ?? [];
const kb = createKnowledgeBase();
for (const doc of kbData) {
  kb.add(doc);
}

interface ChatRequest {
  message: string;
}

/** 将文档文件路径转换为站点相对 URL */
function docPathToUrl(source?: string): string {
  if (!source) return "#";
  let path = source.replace(/^src\/content\/docs\//, "");
  path = path.replace(/\.mdx?$/i, "");
  if (path === "index") return "/";
  path = "/" + path;
  if (!path.endsWith("/")) path += "/";
  return path;
}

/** 调用本地/外部 LLM（非流式），返回文本 */
async function callExternalLLM(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const baseURL = getEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const model = getEnv("OPENAI_MODEL") ?? "gpt-4.1-nano";

  if (!apiKey) return "";

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) return "";
  const data = await response.json().catch(() => ({}));
  return data.choices?.[0]?.message?.content ?? "";
}

/** 调用 Cloudflare Workers AI（非流式），返回文本 */
async function callWorkersAI(
  env: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const ai = env.AI as {
    run(
      model: string,
      params: { messages: Array<{ role: string; content: string }> },
    ): Promise<{ response?: string; text?: string }>;
  };

  const result = await ai.run(WORKERS_AI_MODEL, { messages });
  return result.response ?? result.text ?? "";
}

/** 使用 LLM 提取关键词 */
async function extractKeywordsWithLLM(
  env: Record<string, unknown> | null,
  message: string,
): Promise<string> {
  const prompt = [
    {
      role: "system",
      content:
        "你是关键词提取助手。请从用户问题中提取最重要的 3-5 个关键词，用于技术文档检索。只输出关键词，用空格分隔，不要有任何解释。",
    },
    { role: "user", content: message },
  ];

  const text =
    env && typeof env.AI === "object"
      ? await callWorkersAI(env, prompt)
      : await callExternalLLM(prompt);

  return text.trim().replace(/[\n,，]/g, " ").replace(/\s+/g, " ").trim();
}

function getEnv(key: string): string | undefined {
  const viteEnv = (import.meta.env as Record<string, string | undefined>)[key];
  if (viteEnv !== undefined) return viteEnv;
  return (process.env as Record<string, string | undefined>)[key];
}

/** 创建 SSE 流（模拟打字效果） */
function createSSEStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const chunkSize = 8;
      let i = 0;
      function send() {
        if (i >= text.length) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        const chunk = text.slice(i, i + chunkSize);
        const data = JSON.stringify({
          choices: [{ delta: { content: chunk } }],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        i += chunkSize;
        setTimeout(send, 30);
      }
      send();
    },
  });
}

/** 精简 SSE 事件：只保留 delta.content / delta.reasoning，去除 logprobs 等噪音 */
function stripSSEPayload(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const delta = parsed.choices?.[0]?.delta;
    const stripped: Record<string, unknown> = {};
    if (delta?.content !== undefined) stripped.content = delta.content;
    if (delta?.reasoning !== undefined) stripped.reasoning = delta.reasoning;
    return JSON.stringify({ choices: [{ delta: stripped }] });
  } catch {
    return raw;
  }
}

/** 在 LLM SSE 流结束前注入 sources 事件 */
function wrapLLMStreamWithSources(
  llmStream: ReadableStream,
  sources: Array<{ title: string; url: string }>,
): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = llmStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double newlines
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const dataMatch = event.match(/^data: (.+)$/m);
            if (!dataMatch) {
              controller.enqueue(encoder.encode(event + "\n\n"));
              continue;
            }
            const data = dataMatch[1];
            if (data === "[DONE]") {
              // Inject sources before forwarding [DONE]
              const sourcesPayload = JSON.stringify({
                choices: [{ delta: { content: "" } }],
                sources,
              });
              controller.enqueue(
                encoder.encode(`data: ${sourcesPayload}\n\n`),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } else {
              const stripped = stripSSEPayload(data);
              controller.enqueue(
                encoder.encode(`data: ${stripped}\n\n`),
              );
            }
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          const dataMatch = buffer.match(/^data: (.+)$/m);
          if (dataMatch && dataMatch[1] === "[DONE]") {
            const sourcesPayload = JSON.stringify({
              choices: [{ delta: { content: "" } }],
              sources,
            });
            controller.enqueue(
              encoder.encode(`data: ${sourcesPayload}\n\n`),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } else if (dataMatch) {
            const stripped = stripSSEPayload(dataMatch[1]);
            controller.enqueue(encoder.encode(`data: ${stripped}\n\n`));
          } else {
            controller.enqueue(encoder.encode(buffer + "\n\n"));
          }
        }
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
}

/** 调用本地/外部 LLM，返回 SSE 流 */
async function callExternalLLMStream(
  messages: Array<{ role: string; content: string }>,
  sources: Array<{ title: string; url: string }>,
): Promise<ReadableStream> {
  const apiKey = getEnv("OPENAI_API_KEY");
  const baseURL = getEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  const model = getEnv("OPENAI_MODEL") ?? "gpt-4.1-nano";

  if (!apiKey) {
    return createSSEStream(
      "LLM 未配置：本地开发请设置 OPENAI_API_KEY 环境变量。",
    );
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown");
    return createSSEStream(`LLM API error ${response.status}: ${text.slice(0, 200)}`);
  }

  // 透传 LLM 的 SSE 流，并在末尾注入 sources
  const stream = response.body ?? createSSEStream("");
  return wrapLLMStreamWithSources(stream, sources);
}

/** 调用 Cloudflare Workers AI，包装为 SSE 流 */
async function callWorkersAIStream(
  env: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>,
  sources: Array<{ title: string; url: string }>,
): Promise<ReadableStream> {
  const ai = env.AI as {
    run(
      model: string,
      params: { messages: Array<{ role: string; content: string }> },
    ): Promise<{ response?: string; text?: string }>;
  };

  const result = await ai.run(WORKERS_AI_MODEL, { messages });
  let text = result.response ?? result.text ?? "";

  if (sources.length > 0) {
    text +=
      "\n\n---\n\n**参考文档：**\n" +
      sources.map((s) => `- [${s.title}](${s.url})`).join("\n");
  }

  return createSSEStream(text);
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response(
      createSSEStream("错误：请求体必须是有效的 JSON。"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const { message } = body;
  if (!message || typeof message !== "string") {
    return new Response(
      createSSEStream("错误：message 字段必填且为字符串。"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const env = locals as unknown as Record<string, unknown>;
  const hasWorkersAI = env.AI && typeof env.AI === "object";

  // 使用 LLM 提取关键词，替代简单的正则过滤
  const keywords = await extractKeywordsWithLLM(
    hasWorkersAI ? env : null,
    message,
  );
  const rawResults = kb.search(keywords || message, 10);

  // 按文档 URL 去重，每个文档只保留相似度最高的 chunk，并过滤低质量结果
  const bestByUrl = new Map<string, (typeof rawResults)[0]>();
  for (const r of rawResults) {
    const url = docPathToUrl(r.document.metadata?.source as string | undefined);
    const existing = bestByUrl.get(url);
    if (!existing || r.score > existing.score) {
      bestByUrl.set(url, r);
    }
  }
  const results = Array.from(bestByUrl.values())
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const sourceMap = new Map<string, { title: string; url: string }>();

  const contextParts = results.map((r, i) => {
    const source = r.document.metadata?.source as string | undefined;
    const title = (r.document.metadata?.title as string) || "文档";
    const url = docPathToUrl(source);
    if (source && !sourceMap.has(url)) {
      sourceMap.set(url, { title, url });
    }
    return `[${i + 1}] ${title}\n来源：${url}\n${r.document.content}`;
  });

  const context = contextParts.join("\n\n");
  const sources = Array.from(sourceMap.values());

  // context 为空直接返回，不浪费 LLM 调用
  if (!context.trim()) {
    return new Response(
      createSSEStream("未检索到相关文档，请尝试使用其他关键词。"),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // 将上下文放入 system prompt，确保 LLM 能看到
  const systemPrompt =
    "你是 VentoStack 框架的技术文档助手。请严格基于下方提供的文档片段回答用户问题。" +
    "不要输出思考过程，直接给出最终答案。" +
    "如果文档中没有相关信息，明确告知用户。不要编造信息。回答应简洁、准确，使用中文。\n\n" +
    "引用规范：当信息来自某个文档片段时，请在回答中使用 Markdown 链接格式标注来源，例如：[文件存储概述](/platform/oss/overview/)。\n\n" +
    "代码规范：当问题涉及 API 使用、配置或实现时，尽量直接给出可运行的参考代码示例，而不仅仅是文字描述。\n\n" +
    "=== 文档片段 ===\n" +
    context +
    "\n=== 文档片段结束 ===";

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  // 调试输出：打印完整请求上下文
  console.log("====== Ask AI Debug ======");
  console.log("用户问题:", message);
  console.log("提取关键词:", keywords || "(使用原句)");
  console.log("原始检索结果数:", rawResults.length);
  console.log(
    "原始检索来源:",
    rawResults.map((r) => `${r.document.metadata?.title ?? "无标题"}(score:${r.score.toFixed(3)})`),
  );
  console.log("去重后结果数:", results.length);
  console.log(
    "去重后来源:",
    results.map((r) => `${r.document.metadata?.title ?? "无标题"}(score:${r.score.toFixed(3)})`),
  );
  console.log("完整 Prompt:");
  console.log(JSON.stringify(messages, null, 2));
  console.log("==========================");

  try {

    const stream =
      env.AI && typeof env.AI === "object"
        ? await callWorkersAIStream(env, messages, sources)
        : await callExternalLLMStream(messages, sources);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(createSSEStream(`错误：${errorMsg}`), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
};
