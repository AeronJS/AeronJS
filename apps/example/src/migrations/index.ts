import type { Migration } from "@ventostack/database";
import { migration001 } from "./001_create_users";

export const migrations: Migration[] = [migration001];
