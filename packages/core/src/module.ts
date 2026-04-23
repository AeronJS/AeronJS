// @ventostack/core - 模块系统

import type { Router } from "./router";

/** 模块定义 */
export interface ModuleDefinition {
  /** 模块名称 */
  name: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 路由注册函数 */
  routes?: (router: Router) => void;
  /** 模块服务集合 */
  services?: Record<string, unknown>;
  /** 初始化钩子 */
  onInit?: () => Promise<void> | void;
  /** 销毁钩子 */
  onDestroy?: () => Promise<void> | void;
}

/**
 * 定义模块
 * @param definition - 模块定义
 * @returns 模块定义对象
 */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

/** 模块注册表接口 */
export interface ModuleRegistry {
  /**
   * 注册模块
   * @param module - 模块定义
   */
  register(module: ModuleDefinition): void;
  /**
   * 获取指定模块
   * @param name - 模块名称
   * @returns 模块定义或 undefined
   */
  getModule(name: string): ModuleDefinition | undefined;
  /** 获取所有已注册模块 */
  listModules(): ModuleDefinition[];
  /** 初始化所有模块 */
  initAll(): Promise<void>;
  /** 销毁所有模块 */
  destroyAll(): Promise<void>;
  /**
   * 将模块路由应用到路由器
   * @param router - 路由器实例
   */
  applyRoutes(router: Router): void;
}

/**
 * 创建模块注册表
 * @returns ModuleRegistry 实例
 */
export function createModuleRegistry(): ModuleRegistry {
  const modules: ModuleDefinition[] = [];
  const moduleMap = new Map<string, ModuleDefinition>();

  return {
    register(module) {
      if (module.disabled) {
        return;
      }
      if (moduleMap.has(module.name)) {
        throw new Error(`Module "${module.name}" is already registered`);
      }
      modules.push(module);
      moduleMap.set(module.name, module);
    },

    getModule(name) {
      return moduleMap.get(name);
    },

    listModules() {
      return [...modules];
    },

    async initAll() {
      for (const mod of modules) {
        if (mod.onInit) {
          await mod.onInit();
        }
      }
    },

    async destroyAll() {
      for (let i = modules.length - 1; i >= 0; i--) {
        const mod = modules[i]!;
        if (mod.onDestroy) {
          await mod.onDestroy();
        }
      }
    },

    applyRoutes(router) {
      for (const mod of modules) {
        if (mod.routes) {
          mod.routes(router);
        }
      }
    },
  };
}
