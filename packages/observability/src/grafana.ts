/**
 * @ventostack/observability - Grafana Dashboard JSON 模板生成
 * 提供 Grafana Dashboard 与面板的程序化生成能力，支持阈值告警着色
 * 内置 HTTP 服务预设模板（请求速率、P99 延迟、错误率、活跃连接数）
 */

/** Grafana 面板配置 */
export interface GrafanaPanelConfig {
  /** 面板标题 */
  title: string;
  /** 面板可视化类型 */
  type: "graph" | "stat" | "gauge" | "table" | "timeseries" | "heatmap";
  /** PromQL 查询表达式 */
  query: string;
  /** 数据源名称或变量，默认使用 ${DS_PROMETHEUS} */
  datasource?: string;
  /** 显示单位 */
  unit?: string;
  /** 阈值配置，用于告警着色 */
  thresholds?: Array<{ value: number; color: string }>;
}

/** Grafana Dashboard 配置 */
export interface GrafanaDashboardConfig {
  /** Dashboard 标题 */
  title: string;
  /** Dashboard 描述 */
  description?: string;
  /** 标签列表 */
  tags?: string[];
  /** 自动刷新间隔，例如 "30s" */
  refresh?: string;
  /** 默认时间范围起始，例如 "now-1h" */
  timeFrom?: string;
  /** 面板列表 */
  panels: GrafanaPanelConfig[];
}

/** Grafana Dashboard 生成器接口 */
export interface GrafanaDashboard {
  /** 生成 Dashboard JSON 对象
   * @returns Grafana Dashboard JSON 结构 */
  generate(): Record<string, unknown>;
  /** 生成格式化的 Dashboard JSON 字符串
   * @returns JSON 字符串 */
  toJSON(): string;
}

/**
 * 创建 Grafana Dashboard JSON 模板
 * @param config Dashboard 配置
 * @returns GrafanaDashboard 实例 */
export function createGrafanaDashboard(config: GrafanaDashboardConfig): GrafanaDashboard {
  function buildPanel(panel: GrafanaPanelConfig, index: number) {
    return {
      id: index + 1,
      title: panel.title,
      type: panel.type,
      gridPos: {
        x: (index % 2) * 12,
        y: Math.floor(index / 2) * 8,
        w: 12,
        h: 8,
      },
      datasource: panel.datasource ?? "${DS_PROMETHEUS}",
      targets: [
        {
          expr: panel.query,
          refId: "A",
        },
      ],
      fieldConfig: {
        defaults: {
          ...(panel.unit ? { unit: panel.unit } : {}),
          thresholds: panel.thresholds
            ? {
                mode: "absolute",
                steps: [
                  { value: null as unknown, color: "green" },
                  ...panel.thresholds.map((t) => ({ value: t.value, color: t.color })),
                ],
              }
            : undefined,
        },
      },
    };
  }

  return {
    generate() {
      return {
        dashboard: {
          id: null,
          uid: null,
          title: config.title,
          description: config.description ?? "",
          tags: config.tags ?? [],
          timezone: "browser",
          refresh: config.refresh ?? "30s",
          time: {
            from: config.timeFrom ?? "now-1h",
            to: "now",
          },
          panels: config.panels.map(buildPanel),
          schemaVersion: 39,
          version: 0,
        },
        overwrite: true,
      };
    },

    toJSON(): string {
      return JSON.stringify(this.generate(), null, 2);
    },
  };
}

/**
 * 预设 HTTP 服务 Dashboard 模板
 * @param serviceName 服务名称，用于面板查询过滤
 * @returns 包含请求速率、P99 延迟、错误率、活跃连接数面板的 Dashboard */
export function createHttpDashboard(serviceName: string): GrafanaDashboard {
  return createGrafanaDashboard({
    title: `${serviceName} - HTTP Metrics`,
    tags: ["ventostack", "http", serviceName],
    panels: [
      {
        title: "Request Rate",
        type: "timeseries",
        query: `rate(http_requests_total{service="${serviceName}"}[5m])`,
        unit: "reqps",
      },
      {
        title: "Response Time (p99)",
        type: "timeseries",
        query: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="${serviceName}"}[5m]))`,
        unit: "s",
      },
      {
        title: "Error Rate",
        type: "stat",
        query: `rate(http_requests_total{service="${serviceName}",status=~"5.."}[5m]) / rate(http_requests_total{service="${serviceName}"}[5m])`,
        unit: "percentunit",
        thresholds: [
          { value: 0.01, color: "yellow" },
          { value: 0.05, color: "red" },
        ],
      },
      {
        title: "Active Connections",
        type: "gauge",
        query: `http_active_connections{service="${serviceName}"}`,
      },
    ],
  });
}
