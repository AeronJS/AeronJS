import { defineModel, column } from '@ventostack/database';

export const LoginLogModel = defineModel('sys_login_log', {
  id: column.varchar({ primary: true, length: 36 }),
  userId: column.varchar({ length: 36, nullable: true }),
  username: column.varchar({ length: 64 }),
  ip: column.varchar({ length: 45 }),
  location: column.varchar({ length: 128, nullable: true }),
  browser: column.varchar({ length: 64, nullable: true }),
  os: column.varchar({ length: 64, nullable: true }),
  status: column.int({ default: 0 }),
  message: column.varchar({ length: 512, nullable: true }),
  loginAt: column.timestamp(),
}, { timestamps: false });

export const OperationLogModel = defineModel('sys_operation_log', {
  id: column.varchar({ primary: true, length: 36 }),
  userId: column.varchar({ length: 36, nullable: true }),
  username: column.varchar({ length: 64 }),
  module: column.varchar({ length: 64 }),
  action: column.varchar({ length: 64 }),
  method: column.varchar({ length: 10 }),
  url: column.varchar({ length: 512 }),
  ip: column.varchar({ length: 45 }),
  params: column.text({ nullable: true }),
  result: column.int({ nullable: true }),
  errorMsg: column.text({ nullable: true }),
  duration: column.int({ nullable: true }),
  createdAt: column.timestamp(),
}, { timestamps: false });
