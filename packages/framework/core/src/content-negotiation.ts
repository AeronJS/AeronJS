// @ventostack/core - 内容协商（Content Negotiation）

/** 协商结果 */
export interface NegotiationResult {
  /** 响应类型 */
  type: "json" | "html" | "text" | "xml";
  /** Content-Type 值 */
  contentType: string;
}

const MEDIA_TYPES: Record<string, NegotiationResult> = {
  "application/json": { type: "json", contentType: "application/json" },
  "text/html": { type: "html", contentType: "text/html; charset=utf-8" },
  "text/plain": { type: "text", contentType: "text/plain; charset=utf-8" },
  "application/xml": { type: "xml", contentType: "application/xml" },
  "text/xml": { type: "xml", contentType: "application/xml" },
};

interface AcceptEntry {
  /** MIME 类型 */
  type: string;
  /** 质量因子 */
  quality: number;
}

/**
 * 解析 Accept 请求头
 * @param accept - Accept 头值
 * @returns 按质量排序的 AcceptEntry 列表
 */
function parseAcceptHeader(accept: string): AcceptEntry[] {
  return accept
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const [type, ...params] = trimmed.split(";");
      let quality = 1.0;
      for (const param of params) {
        const [key, val] = param.trim().split("=");
        if (key?.trim() === "q" && val) {
          quality = Number.parseFloat(val);
          if (Number.isNaN(quality)) quality = 0;
        }
      }
      return { type: type?.trim() ?? "*/*", quality };
    })
    .sort((a, b) => b.quality - a.quality);
}

/**
 * 根据 Accept header 选择最合适的响应类型。
 * 默认返回 JSON。
 * @param acceptHeader - Accept 请求头值
 * @param supported - 服务端支持的类型列表
 * @returns 协商结果
 */
export function negotiate(
  acceptHeader: string | null,
  supported: Array<"json" | "html" | "text" | "xml"> = ["json", "html", "text"],
): NegotiationResult {
  const defaultResult = MEDIA_TYPES["application/json"]!;

  if (!acceptHeader || acceptHeader === "*/*") {
    return defaultResult;
  }

  const entries = parseAcceptHeader(acceptHeader);

  const supportedMediaTypes = new Map<string, NegotiationResult>();
  for (const type of supported) {
    for (const [mediaType, result] of Object.entries(MEDIA_TYPES)) {
      if (result.type === type) {
        supportedMediaTypes.set(mediaType, result);
      }
    }
  }

  for (const entry of entries) {
    if (entry.type === "*/*") {
      return defaultResult;
    }

    // 精确匹配
    const match = supportedMediaTypes.get(entry.type);
    if (match) return match;

    // 通配符匹配 (e.g., text/*)
    if (entry.type.endsWith("/*")) {
      const prefix = entry.type.slice(0, -1);
      for (const [mediaType, result] of supportedMediaTypes) {
        if (mediaType.startsWith(prefix)) {
          return result;
        }
      }
    }
  }

  return defaultResult;
}
