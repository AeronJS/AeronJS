/**
 * @ventostack/system - MenuTreeBuilder
 * 前端路由与权限构建器：根据用户角色生成前端路由树和权限列表
 * 菜单类型：1=目录 2=菜单 3=按钮
 */

import type { SqlExecutor } from "@ventostack/database";

/** 前端路由元信息 */
export interface RouteMeta {
  title: string;
  icon?: string;
  hidden?: boolean;
  permissions?: string[];
}

/** 前端路由结构 */
export interface FrontendRoute {
  name: string;
  path: string;
  component?: string;
  redirect?: string;
  meta: RouteMeta;
  children?: FrontendRoute[];
}

/** 菜单行记录（从数据库查询） */
interface MenuRow {
  id: string;
  parent_id: string | null;
  name: string;
  path: string;
  component: string;
  redirect: string;
  type: number;
  permission: string;
  icon: string;
  sort: number;
  visible: boolean;
}

/** 菜单树构建器接口 */
export interface MenuTreeBuilder {
  /** 构建用户可访问的前端路由树 */
  buildRoutesForUser(userId: string): Promise<FrontendRoute[]>;
  /** 构建用户的权限字符串列表 */
  buildPermissionsForUser(userId: string): Promise<string[]>;
}

/**
 * 将菜单行记录转换为前端路由
 * @param menu 菜单行记录
 * @param childRoutes 子路由列表
 * @param buttonPermissions 按钮权限列表
 * @returns 前端路由对象
 */
function toFrontendRoute(
  menu: MenuRow,
  childRoutes: FrontendRoute[],
  buttonPermissions: string[],
): FrontendRoute {
  const meta: RouteMeta = {
    title: menu.name,
    hidden: !menu.visible,
  };
  if (menu.icon) {
    meta.icon = menu.icon;
  }
  if (buttonPermissions.length > 0) {
    meta.permissions = buttonPermissions;
  }

  const route: FrontendRoute = {
    name: menu.name,
    path: menu.path,
    meta,
  };

  if (menu.component) {
    route.component = menu.component;
  }

  if (menu.redirect) {
    route.redirect = menu.redirect;
  }

  if (childRoutes.length > 0) {
    route.children = childRoutes;
  }

  return route;
}

/**
 * 从扁平的菜单列表构建前端路由树
 * 只包含 type=1(目录) 和 type=2(菜单) 的记录
 * @param menus 扁平菜单列表
 * @param parentId 父级 ID（null 表示根级）
 * @param buttonMap 按钮权限映射：menuId -> permission[]
 * @returns 前端路由树
 */
function buildRouteTree(
  menus: MenuRow[],
  parentId: string | null,
  buttonMap: Map<string, string[]>,
): FrontendRoute[] {
  // 过滤出当前层级的目录和菜单
  const currentLevel = menus
    .filter((m) => m.parent_id === parentId && (m.type === 1 || m.type === 2))
    .sort((a, b) => a.sort - b.sort);

  const routes: FrontendRoute[] = [];

  for (const menu of currentLevel) {
    const childRoutes = buildRouteTree(menus, menu.id, buttonMap);
    const buttonPermissions = buttonMap.get(menu.id) ?? [];
    routes.push(toFrontendRoute(menu, childRoutes, buttonPermissions));
  }

  return routes;
}

/**
 * 创建菜单树构建器实例
 * @param deps 依赖项
 * @returns 菜单树构建器实例
 */
export function createMenuTreeBuilder(deps: {
  executor: SqlExecutor;
}): MenuTreeBuilder {
  const { executor } = deps;

  /**
   * 查询用户的角色关联的所有菜单 ID
   * @param userId 用户 ID
   * @returns 菜单 ID 集合
   */
  async function queryUserMenuIds(userId: string): Promise<Set<string>> {
    // 查询用户的所有角色
    const roleRows = await executor(
      `SELECT r.id FROM sys_user_role ur
       JOIN sys_role r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND r.status = 1 AND r.deleted_at IS NULL`,
      [userId],
    );
    const roleIds = (roleRows as Array<{ id: string }>).map((r) => r.id);

    if (roleIds.length === 0) return new Set();

    // 查询角色关联的菜单 ID
    const placeholders = roleIds.map((_, i) => `$${i + 1}`).join(", ");
    const menuRows = await executor(
      `SELECT DISTINCT menu_id FROM sys_role_menu WHERE role_id IN (${placeholders})`,
      roleIds,
    );

    return new Set(
      (menuRows as Array<{ menu_id: string }>).map((r) => r.menu_id),
    );
  }

  /**
   * 查询所有启用的菜单
   * @returns 菜单行记录列表
   */
  async function queryAllMenus(): Promise<MenuRow[]> {
    const rows = await executor(
      `SELECT id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible
       FROM sys_menu WHERE status = 1
       ORDER BY sort ASC`,
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      parent_id: (row.parent_id as string) ?? null,
      name: row.name as string,
      path: (row.path as string) ?? "",
      component: (row.component as string) ?? "",
      redirect: (row.redirect as string) ?? "",
      type: row.type as number,
      permission: (row.permission as string) ?? "",
      icon: (row.icon as string) ?? "",
      sort: row.sort as number,
      visible: (row.visible as boolean) ?? true,
    }));
  }

  return {
    async buildRoutesForUser(userId) {
      // 1. 查询用户可访问的菜单 ID
      const menuIds = await queryUserMenuIds(userId);

      // admin 角色可能有全部菜单权限，此处通过是否有菜单来判断
      if (menuIds.size === 0) return [];

      // 2. 查询所有菜单
      const allMenus = await queryAllMenus();

      // 3. 过滤出用户有权访问的菜单（目录和菜单类型）
      // 需要保证父级目录也被包含，即使父级没有被直接授权
      const accessibleMenus = filterAccessibleMenus(allMenus, menuIds);

      // 4. 构建按钮权限映射（type=3 的菜单按钮）
      const buttonMap = new Map<string, string[]>();
      for (const menu of allMenus) {
        if (menu.type === 3 && menuIds.has(menu.id) && menu.parent_id) {
          const existing = buttonMap.get(menu.parent_id) ?? [];
          if (menu.permission) {
            existing.push(menu.permission);
          }
          buttonMap.set(menu.parent_id, existing);
        }
      }

      // 5. 构建路由树
      return buildRouteTree(accessibleMenus, null, buttonMap);
    },

    async buildPermissionsForUser(userId) {
      // 1. 查询用户可访问的菜单 ID
      const menuIds = await queryUserMenuIds(userId);
      if (menuIds.size === 0) return [];

      // 2. 查询所有菜单
      const allMenus = await queryAllMenus();

      // 3. 过滤出 type=3(按钮) 的菜单权限
      const permissions: string[] = [];
      for (const menu of allMenus) {
        if (menu.type === 3 && menuIds.has(menu.id) && menu.permission) {
          permissions.push(menu.permission);
        }
      }

      return permissions;
    },
  };
}

/**
 * 过滤出可访问的菜单，并自动补全父级目录
 * @param allMenus 所有菜单
 * @param accessibleIds 可访问的菜单 ID 集合
 * @returns 可访问的菜单列表（包含必要的父级目录）
 */
function filterAccessibleMenus(
  allMenus: MenuRow[],
  accessibleIds: Set<string>,
): MenuRow[] {
  // 收集所有需要包含的 ID（包括祖先链）
  const includedIds = new Set<string>();

  const menuById = new Map<string, MenuRow>();
  for (const menu of allMenus) {
    menuById.set(menu.id, menu);
  }

  // 对每个可访问的菜单，向上追溯父级链
  for (const id of accessibleIds) {
    let currentId: string | null = id;
    while (currentId) {
      if (includedIds.has(currentId)) break;
      includedIds.add(currentId);

      const menu = menuById.get(currentId);
      currentId = menu?.parent_id ?? null;
    }
  }

  return allMenus.filter((m) => includedIds.has(m.id));
}
