/**
 * @ventostack/auth - 基于角色的访问控制（RBAC）
 * 默认 deny，必须显式授权；基于内存 Map 存储角色与权限关系
 */

/**
 * 权限定义
 * 描述对某个资源的某种操作权限
 */
export interface Permission {
  /** 资源标识（如 "user", "order", "post"） */
  resource: string;
  /** 操作类型（如 "read", "write", "delete"） */
  action: string;
}

/**
 * 角色定义
 * 一组权限的集合，用于批量授权
 */
export interface Role {
  /** 角色名称 */
  name: string;
  /** 角色拥有的权限列表 */
  permissions: Permission[];
}

/**
 * RBAC 管理器接口
 * 提供角色的增删改查与权限判定能力
 */
export interface RBAC {
  /**
   * 添加角色
   * @param role 角色定义
   */
  addRole(role: Role): void;

  /**
   * 移除角色
   * @param name 角色名称
   */
  removeRole(name: string): void;

  /**
   * 获取角色定义
   * @param name 角色名称
   * @returns 角色定义，不存在时返回 undefined
   */
  getRole(name: string): Role | undefined;

  /**
   * 判断指定角色是否拥有某权限
   * @param roleName 角色名称
   * @param resource 资源标识
   * @param action 操作类型
   * @returns 拥有权限返回 true，否则返回 false
   */
  hasPermission(roleName: string, resource: string, action: string): boolean;

  /**
   * 判断一组角色中是否有任一角色拥有某权限
   * @param roles 角色名称列表
   * @param resource 资源标识
   * @param action 操作类型
   * @returns 拥有权限返回 true，否则返回 false
   */
  can(roles: string[], resource: string, action: string): boolean;

  /**
   * 列出所有已注册的角色
   * @returns 角色列表
   */
  listRoles(): Role[];
}

/**
 * 创建 RBAC 管理器实例
 * 基于内存 Map 存储角色与权限关系
 * @returns RBAC 管理器实例
 */
export function createRBAC(): RBAC {
  const roles = new Map<string, Role>();

  return {
    addRole(role: Role): void {
      roles.set(role.name, {
        name: role.name,
        permissions: [...role.permissions],
      });
    },

    removeRole(name: string): void {
      roles.delete(name);
    },

    getRole(name: string): Role | undefined {
      const role = roles.get(name);
      if (!role) return undefined;
      return { name: role.name, permissions: [...role.permissions] };
    },

    hasPermission(roleName: string, resource: string, action: string): boolean {
      const role = roles.get(roleName);
      if (!role) return false;
      return role.permissions.some((p) => p.resource === resource && p.action === action);
    },

    can(roleNames: string[], resource: string, action: string): boolean {
      return roleNames.some((roleName) => {
        const role = roles.get(roleName);
        if (!role) return false;
        return role.permissions.some((p) => p.resource === resource && p.action === action);
      });
    },

    listRoles(): Role[] {
      return Array.from(roles.values()).map((r) => ({
        name: r.name,
        permissions: [...r.permissions],
      }));
    },
  };
}
