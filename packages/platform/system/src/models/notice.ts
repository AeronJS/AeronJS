import { defineModel, column } from '@ventostack/database';

export const NoticeModel = defineModel('sys_notice', {
  id: column.varchar({ primary: true, length: 36 }),
  title: column.varchar({ length: 256 }),
  content: column.text(),
  type: column.int({ default: 1 }),
  status: column.int({ default: 0 }),
  publisherId: column.varchar({ length: 36, nullable: true }),
  publishAt: column.timestamp({ nullable: true }),
}, { softDelete: true, timestamps: true });

export const UserNoticeModel = defineModel('sys_user_notice', {
  userId: column.varchar({ length: 36 }),
  noticeId: column.varchar({ length: 36 }),
  readAt: column.timestamp({ nullable: true }),
}, { timestamps: false });
