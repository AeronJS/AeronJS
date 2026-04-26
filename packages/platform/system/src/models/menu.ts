import { defineModel, column } from '@ventostack/database';

export const MenuModel = defineModel('sys_menu', {
  id: column.varchar({ primary: true, length: 36 }),
  parentId: column.varchar({ length: 36, nullable: true }),
  name: column.varchar({ length: 64 }),
  path: column.varchar({ length: 256, nullable: true }),
  component: column.varchar({ length: 256, nullable: true }),
  redirect: column.varchar({ length: 256, nullable: true }),
  type: column.int({ default: 1 }),
  permission: column.varchar({ length: 128, nullable: true }),
  icon: column.varchar({ length: 64, nullable: true }),
  sort: column.int({ default: 0 }),
  visible: column.boolean({ default: true }),
  status: column.int({ default: 1 }),
}, { timestamps: true });

export const RoleMenuModel = defineModel('sys_role_menu', {
  roleId: column.varchar({ length: 36 }),
  menuId: column.varchar({ length: 36 }),
}, { timestamps: false });
