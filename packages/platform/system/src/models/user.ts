import { defineModel, column } from '@ventostack/database';

export const UserModel = defineModel('sys_user', {
  id: column.varchar({ primary: true, length: 36 }),
  username: column.varchar({ length: 64 }),
  passwordHash: column.varchar({ length: 128 }),
  nickname: column.varchar({ length: 64, nullable: true }),
  email: column.varchar({ length: 128, nullable: true }),
  phone: column.varchar({ length: 20, nullable: true }),
  avatar: column.varchar({ length: 512, nullable: true }),
  gender: column.int({ nullable: true, default: 0 }),
  status: column.int({ default: 1 }),
  deptId: column.varchar({ length: 36, nullable: true }),
  mfaEnabled: column.boolean({ default: false }),
  mfaSecret: column.varchar({ length: 64, nullable: true }),
  remark: column.varchar({ length: 512, nullable: true }),
}, { softDelete: true, timestamps: true });
