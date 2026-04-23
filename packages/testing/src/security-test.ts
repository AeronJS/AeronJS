/**
 * @ventostack/testing - 安全回归测试工具
 * 提供 XSS、SQL 注入、路径遍历、CSRF 等常见攻击面的载荷生成与端点安全测试能力
 */

/** 安全测试套件接口 */
export interface SecurityTestSuite {
  /**
   * 获取 XSS 攻击载荷列表
   * @returns XSS 载荷字符串数组
   */
  xssPayloads(): string[];

  /**
   * 获取 SQL 注入攻击载荷列表
   * @returns SQL 注入载荷字符串数组
   */
  sqlInjectionPayloads(): string[];

  /**
   * 获取路径遍历攻击载荷列表
   * @returns 路径遍历载荷字符串数组
   */
  pathTraversalPayloads(): string[];

  /**
   * 获取 CSRF 攻击请求配置列表
   * @returns 包含 method 和 headers 的请求配置数组
   */
  csrfPayloads(): Array<{ method: string; headers: Record<string, string> }>;

  /**
   * 生成指定大小的超大载荷
   * @param sizeBytes 载荷大小（字节）
   * @returns 由重复字符组成的超大字符串
   */
  oversizedPayload(sizeBytes: number): string;

  /**
   * 对指定端点执行安全测试
   * @param client HTTP 客户端（需实现 fetch 方法）
   * @param url 测试端点 URL
   * @param options 测试选项（可选）
   * @returns 包含 passed（是否通过）和 failures（失败详情）的测试结果
   */
  testEndpoint(
    client: {
      fetch: (url: string, init?: RequestInit) => Promise<Response>;
    },
    url: string,
    options?: {
      /** 预期的响应状态码列表，默认 [400, 403, 422] */
      expectedStatus?: number[];
      /** 是否测试 XSS，默认 true */
      testXSS?: boolean;
      /** 是否测试 SQL 注入，默认 true */
      testSQLi?: boolean;
      /** 是否测试路径遍历，默认 true */
      testPathTraversal?: boolean;
    },
  ): Promise<{ passed: boolean; failures: string[] }>;
}

/** XSS 攻击载荷集合 */
const XSS_PAYLOADS: string[] = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "javascript:alert(1)",
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  '<iframe src="javascript:alert(1)">',
  "<body onload=alert(1)>",
  "<input onfocus=alert(1) autofocus>",
  '{{constructor.constructor("alert(1)")()}}',
];

/** SQL 注入攻击载荷集合 */
const SQLI_PAYLOADS: string[] = [
  "' OR 1=1 --",
  '"; DROP TABLE users; --',
  "' UNION SELECT NULL, NULL --",
  "1; SELECT * FROM information_schema.tables --",
  "' AND 1=CONVERT(int,(SELECT TOP 1 table_name FROM information_schema.tables)) --",
  "admin'--",
  "1' ORDER BY 1 --",
  "' OR '1'='1",
  "-1 OR 1=1",
  "'; EXEC xp_cmdshell('whoami') --",
];

/** 路径遍历攻击载荷集合 */
const PATH_TRAVERSAL_PAYLOADS: string[] = [
  "../../../etc/passwd",
  "..%2F..%2F..%2Fetc%2Fpasswd",
  "....//....//....//etc/passwd",
  "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "..\\..\\..\\windows\\system32\\config\\sam",
  "%00",
  "..%00",
  "/etc/passwd%00.jpg",
  "....//",
  "..%252f..%252f..%252fetc%252fpasswd",
];

/**
 * 创建安全测试套件实例
 * 提供 XSS、SQL 注入、路径遍历、CSRF 等常见攻击面的测试能力
 * @returns 安全测试套件实例
 */
export function createSecurityTestSuite(): SecurityTestSuite {
  return {
    xssPayloads() {
      return [...XSS_PAYLOADS];
    },

    sqlInjectionPayloads() {
      return [...SQLI_PAYLOADS];
    },

    pathTraversalPayloads() {
      return [...PATH_TRAVERSAL_PAYLOADS];
    },

    csrfPayloads() {
      return [
        { method: "POST", headers: {} },
        { method: "POST", headers: { origin: "https://evil.com" } },
        { method: "POST", headers: { referer: "https://evil.com/attack" } },
        {
          method: "PUT",
          headers: { origin: "https://evil.com" },
        },
        {
          method: "DELETE",
          headers: { origin: "https://evil.com" },
        },
      ];
    },

    oversizedPayload(sizeBytes: number): string {
      return "A".repeat(sizeBytes);
    },

    async testEndpoint(client, url, options = {}) {
      const {
        expectedStatus = [400, 403, 422],
        testXSS = true,
        testSQLi = true,
        testPathTraversal = true,
      } = options;

      const failures: string[] = [];

      async function testPayloads(category: string, payloads: string[]): Promise<void> {
        for (const payload of payloads) {
          try {
            const response = await client.fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ input: payload }),
            });

            if (!expectedStatus.includes(response.status)) {
              failures.push(
                `${category}: payload "${payload.slice(0, 50)}" returned status ${response.status}, expected one of [${expectedStatus.join(", ")}]`,
              );
            }
          } catch (error) {
            failures.push(
              `${category}: payload "${payload.slice(0, 50)}" threw error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (testXSS) {
        await testPayloads("XSS", XSS_PAYLOADS);
      }
      if (testSQLi) {
        await testPayloads("SQLi", SQLI_PAYLOADS);
      }
      if (testPathTraversal) {
        await testPayloads("PathTraversal", PATH_TRAVERSAL_PAYLOADS);
      }

      return {
        passed: failures.length === 0,
        failures,
      };
    },
  };
}
