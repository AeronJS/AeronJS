import { defineModel, column } from '@ventostack/database';

export const MfaRecoveryModel = defineModel('sys_mfa_recovery', {
  id: column.varchar({ primary: true, length: 36 }),
  userId: column.varchar({ length: 36 }),
  codeHash: column.varchar({ length: 128 }),
  usedAt: column.timestamp({ nullable: true }),
  createdAt: column.timestamp(),
}, { timestamps: false });
