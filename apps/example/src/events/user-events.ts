import { defineEvent } from "@ventostack/events";

export const userLoggedIn = defineEvent<{ userId: string; email: string; at: string }>(
  "user.logged_in",
);

export const userCreated = defineEvent<{ userId: string; email: string; at: string }>(
  "user.created",
);

export const userDeleted = defineEvent<{ userId: string; at: string }>("user.deleted");
