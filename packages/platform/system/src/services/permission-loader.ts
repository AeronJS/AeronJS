/**
 * @ventostack/system - PermissionLoader
 * 权限加载器：从数据库加载角色与菜单权限到 RBAC 引擎和行过滤器
 * 支持全量加载、按角色重新加载
 */

import type { RBAC } from "@ventostack/auth";
import type { RowFilter } from "@ventostack/auth";
import type { SqlExecutor } from "@ventostack/database";

/** 权限字符串解析结果 */
interface ParsedPermission {
  resource: string;
  action: string;
}

/** 权限加载器接口 */
export interface PermissionLoader {
  /** 加载所有角色及其权限到 RBAC 引擎 */
  loadAll(): Promise<void>;
  /** 重新加载指定角色的权限 */
  reloadRole(roleCode: string): Promise<void>;
  /** 重新加载所有角色 */
  reloadAll(): Promise<void>;
}

/**
 * 解析权限字符串为资源+动作
 * 权限字符串格式："module:entity:action"
 * @param permission 权限字符串
 * @returns 解析结果
 */
function parsePermission(permission: string): ParsedPermission | null {
  if (!permission) return null;

  const parts = permission.split(":");
  if (parts.length < 2) return null;

  // "module:entity:action" -> resource = "module:entity", action = "action"
  // "entity:action" -> resource = "entity", action = "action"
  const action = parts[parts.length - 1]!;
  const resource = parts.slice(0, -1).join(":");

  return { resource, action };
}

/**
 * 创建权限加载器实例
 * @param deps 依赖项
 * @returns 权限加载器实例
 */
export function createPermissionLoader(deps: {
  executor: SqlExecutor;
  rbac: RBAC;
  rowFilter: RowFilter;
}): PermissionLoader {
  const { executor, rbac, rowFilter } = deps;

  /**
   * 加载指定角色的权限
   * @param roleId 角色 ID
   * @param roleCode 角色编码
   */
  async function loadRolePermissions(
    roleId: string,
    roleCode: string,
  ): Promise<void> {
    // 查询角色关联的菜单权限
    const rows = await executor(
      `SELECT m.permission
       FROM sys_role_menu rm
       JOIN sys_menu m ON m.id = rm.menu_id
       WHERE rm.role_id = $1 AND m.status = 1 AND m.permission IS NOT NULL AND m.permission != ''`,
      [roleId],
    );

    const permissions = (rows as Array<{ permission: string }>)
      .map((row) => parsePermission(row.permission))
      .filter((p): p is ParsedPermission => p !== null);

    // 注册角色到 RBAC
    rbac.addRole({
      name: roleCode,
      permissions: permissions.map((p) => ({
        resource: p.resource,
        action: p.action,
      })),
    });
  }

  /**
   * 加载数据范围规则到行过滤器
   */
  async function loadDataScopeRules(): Promise<void> {
    // 查询有自定义数据范围的角色
    const rows = await executor(
      `SELECT r.code, r.data_scope
       FROM sys_role r
       WHERE r.status = 1 AND r.deleted_at IS NULL AND r.data_scope IS NOT NULL`,
    );

    const roles = rows as Array<{ code: string; data_scope: number }>;

    for (const role of roles) {
      // data_scope 含义：
      // 1 = 全部数据
      // 2 = 本部门及子部门
      // 3 = 本部门
      // 4 = 仅本人
      // 5 = 自定义部门
      switch (role.data_scope) {
        case 4:
          // 仅本人：按创建者过滤
          rowFilter.addRule({
            resource: "*",
            field: "created_by",
            operator: "eq",
            valueFrom: "user",
            value: "userId",
          });
          break;
        // 其他数据范围规则按需扩展
      }
    }
  }

  return {
    async loadAll() {
      // 1. 查询所有启用角色
      const roleRows = await executor(
        `SELECT id, code FROM sys_role WHERE status = 1 AND deleted_at IS NULL`,
      );
      const roles = roleRows as Array<{ id: string; code: string }>;

      // 2. 为每个角色加载权限
      for (const role of roles) {
        await loadRolePermissions(role.id, role.code);
      }

      // 3. 加载数据范围规则
      await loadDataScopeRules();
    },

    async reloadRole(roleCode) {
      // 查询角色
      const rows = await executor(
        `SELECT id FROM sys_role WHERE code = $1 AND status = 1 AND deleted_at IS NULL`,
        [roleCode],
      );
      const roles = rows as Array<{ id: string }>;

      if (roles.length === 0) {
        // 角色不存在或已禁用，从 RBAC 中移除
        rbac.removeRole(roleCode);
        return;
      }

      await loadRolePermissions(roles[0]!.id, roleCode);
    },

    async reloadAll() {
      // 清除所有现有角色
      const existingRoles = rbac.listRoles();
      for (const role of existingRoles) {
        rbac.removeRole(role.name);
      }

      // 重新加载
      await this.loadAll();
    },
  };
}
