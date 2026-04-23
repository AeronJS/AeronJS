/**
 * @ventostack/observability - W3C TraceContext 传播
 * 提供 W3C traceparent/tracestate 与 B3（Zipkin）两种链路上下文传播格式
 * 用于在 HTTP 请求间传递和提取分布式追踪信息，保证链路连续性
 */

import type { SpanContext } from "./tracing";

/**
 * W3C Trace Context traceparent 格式:
 * 00-{traceId}-{parentId}-{flags}
 */
const TRACEPARENT_REGEX = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/;

/** 链路上下文传播器接口，用于在请求间传递和提取追踪信息 */
export interface TraceContextPropagator {
  /** 从请求头中提取 trace context
   * @param headers 请求头对象
   * @returns 提取到的 SpanContext，若不存在或格式非法则返回 null */
  extract(headers: Headers): SpanContext | null;
  /** 将 trace context 注入请求头
   * @param context 当前 Span 的上下文
   * @param headers 要注入的目标请求头对象 */
  inject(context: SpanContext, headers: Headers): void;
}

/**
 * 创建 W3C TraceContext 传播器
 * 遵循 https://www.w3.org/TR/trace-context/ 规范
 * @returns TraceContextPropagator 实例 */
export function createW3CTraceContextPropagator(): TraceContextPropagator {
  return {
    extract(headers) {
      const traceparent = headers.get("traceparent");
      if (!traceparent) return null;

      const match = TRACEPARENT_REGEX.exec(traceparent);
      if (!match) return null;

      const traceId = match[1]!;
      const spanId = match[2]!;

      // 验证不全是0
      if (traceId === "00000000000000000000000000000000") return null;
      if (spanId === "0000000000000000") return null;

      return { traceId, spanId };
    },

    inject(context, headers) {
      const flags = "01"; // sampled
      const traceparent = `00-${context.traceId}-${context.spanId}-${flags}`;
      headers.set("traceparent", traceparent);

      // tracestate 可以传播自定义数据
      const existingState = headers.get("tracestate");
      if (!existingState) {
        headers.set("tracestate", `ventostack=${context.spanId}`);
      }
    },
  };
}

/**
 * 创建 B3 传播器（Zipkin 风格）
 * 支持单头（b3）与多头（x-b3-*）两种格式
 * @returns TraceContextPropagator 实例 */
export function createB3Propagator(): TraceContextPropagator {
  return {
    extract(headers) {
      // B3 single header format: {traceId}-{spanId}-{sampling}-{parentSpanId}
      const b3 = headers.get("b3");
      if (b3) {
        const parts = b3.split("-");
        if (parts.length >= 2) {
          return { traceId: parts[0]!, spanId: parts[1]! };
        }
      }

      // B3 multi-header format
      const traceId = headers.get("x-b3-traceid");
      const spanId = headers.get("x-b3-spanid");
      if (traceId && spanId) {
        return { traceId, spanId };
      }

      return null;
    },

    inject(context, headers) {
      headers.set("x-b3-traceid", context.traceId);
      headers.set("x-b3-spanid", context.spanId);
      headers.set("x-b3-sampled", "1");
    },
  };
}
