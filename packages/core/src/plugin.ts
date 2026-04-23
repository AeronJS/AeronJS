// @ventostack/core - 插件系统

import type { VentoStackApp } from "./app";

/** 插件接口 */
export interface Plugin {
  /** 插件名称 */
  name: string;
  /**
   * 安装插件到应用
   * @param app - VentoStack 应用实例
   */
  install(app: VentoStackApp): void | Promise<void>;
}
