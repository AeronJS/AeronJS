/**
 * @ventostack/observability — Gauge Metric Type
 * 仪表盘指标接口，支持按标签维度记录瞬时值（set/inc/dec）
 * 标签通过稳定键序列化后存储，保证相同标签组合的一致性
 */

/** 仪表盘（Gauge）指标接口，支持按标签维度记录瞬时值 */
export interface Gauge {
  /** 设置指定标签组合下的指标值
   * @param value 要设置的数值
   * @param labels 可选的标签维度 */
  set(value: number, labels?: Record<string, string>): void;
  /** 对指定标签组合下的指标值加 1
   * @param labels 可选的标签维度 */
  inc(labels?: Record<string, string>): void;
  /** 对指定标签组合下的指标值减 1
   * @param labels 可选的标签维度 */
  dec(labels?: Record<string, string>): void;
  /** 获取指定标签组合下的当前指标值
   * @param labels 可选的标签维度
   * @returns 当前数值，不存在时返回 0 */
  get(labels?: Record<string, string>): number;
  /** 清空所有标签维度的记录 */
  reset(): void;
}

/** 将标签对象转换为稳定字符串键（按键名排序后序列化）
 * @param labels 标签维度对象
 * @returns 可作为 Map 键的稳定字符串 */
export function labelsToKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const sorted = Object.keys(labels).sort();
  return JSON.stringify(Object.fromEntries(sorted.map((k) => [k, labels[k]])));
}

/** 创建内存 Gauge 指标实例
 * @returns Gauge 实例 */
export function createGauge(): Gauge {
  const values = new Map<string, number>();

  return {
    set(value: number, labels?: Record<string, string>): void {
      values.set(labelsToKey(labels), value);
    },
    inc(labels?: Record<string, string>): void {
      const key = labelsToKey(labels);
      values.set(key, (values.get(key) ?? 0) + 1);
    },
    dec(labels?: Record<string, string>): void {
      const key = labelsToKey(labels);
      values.set(key, (values.get(key) ?? 0) - 1);
    },
    get(labels?: Record<string, string>): number {
      return values.get(labelsToKey(labels)) ?? 0;
    },
    reset(): void {
      values.clear();
    },
  };
}
