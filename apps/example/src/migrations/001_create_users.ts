import type { Migration } from "@ventostack/database";

export const migration001: Migration = {
  name: "001_create_users",
  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },
  async down(executor) {
    await executor(`DROP TABLE IF EXISTS users`);
  },
};
