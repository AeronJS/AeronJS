import { describe, expect, test } from "bun:test";
import { createRedisSessionStore } from "../redis-session-store";
import type { RedisSessionClientLike } from "../redis-session-store";

/** 创建内存 mock Redis 客户端 */
function createMockRedisClient(): RedisSessionClientLike {
  const store = new Map<string, { value: string; timer?: Timer }>();

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      return entry.value;
    },
    async set(key: string, value: string): Promise<"OK"> {
      const existing = store.get(key);
      if (existing?.timer) clearTimeout(existing.timer);
      store.set(key, { value });
      return "OK";
    },
    async expire(key: string, seconds: number): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => store.delete(key), seconds * 1000);
      return 1;
    },
    async del(key: string): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      if (entry.timer) clearTimeout(entry.timer);
      store.delete(key);
      return 1;
    },
  };
}

describe("createRedisSessionStore", () => {
  test("implements SessionStore interface", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    const session = {
      id: "test-id",
      data: { key: "value" },
      expiresAt: Date.now() + 60000,
    };

    await store.set(session);
    const retrieved = await store.get("test-id");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.data.key).toBe("value");

    await store.touch("test-id", 120);
    const touched = await store.get("test-id");
    expect(touched).not.toBeNull();

    await store.delete("test-id");
    const deleted = await store.get("test-id");
    expect(deleted).toBeNull();
  });

  test("get returns null for missing session", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    const result = await store.get("non-existent");
    expect(result).toBeNull();
  });

  test("get returns null for expired session", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.set({
      id: "expired",
      data: {},
      expiresAt: Date.now() - 1000,
    });
    // TTL is set to 0 (already expired), but mock may not expire immediately
    // Wait for potential expiry
    await Bun.sleep(100);
    const result = await store.get("expired");
    expect(result).toBeNull();
  });

  test("set stores session with JSON serialization", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client });
    const session = {
      id: "s1",
      data: { userId: "u1", role: "admin" },
      expiresAt: Date.now() + 3600_000,
    };

    await store.set(session);
    const raw = await client.get("session:s1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe("s1");
    expect(parsed.data.userId).toBe("u1");
  });

  test("set applies TTL based on expiresAt", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client });
    await store.set({
      id: "ttl-test",
      data: {},
      expiresAt: Date.now() + 1000,
    });
    expect(await store.get("ttl-test")).not.toBeNull();
    await Bun.sleep(1100);
    expect(await store.get("ttl-test")).toBeNull();
  });

  test("delete removes session", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.set({
      id: "to-delete",
      data: {},
      expiresAt: Date.now() + 60000,
    });
    await store.delete("to-delete");
    expect(await store.get("to-delete")).toBeNull();
  });

  test("delete on missing session does not throw", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.delete("non-existent");
  });

  test("touch extends TTL", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.set({
      id: "touch-test",
      data: {},
      expiresAt: Date.now() + 1000,
    });
    await store.touch("touch-test", 3600);
    await Bun.sleep(1100);
    expect(await store.get("touch-test")).not.toBeNull();
  });

  test("touch on missing session does not throw", async () => {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    await store.touch("non-existent", 3600);
  });

  test("keyPrefix prepends to stored keys", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client, keyPrefix: "app:session:" });
    await store.set({
      id: "prefixed",
      data: { key: "value" },
      expiresAt: Date.now() + 60000,
    });
    expect(await store.get("prefixed")).not.toBeNull();
    expect(await client.get("app:session:prefixed")).not.toBeNull();
    expect(await client.get("session:prefixed")).toBeNull();
  });

  test("keyPrefix: all operations respect prefix", async () => {
    const client = createMockRedisClient();
    const store = createRedisSessionStore({ client, keyPrefix: "app:" });

    await store.set({ id: "s1", data: {}, expiresAt: Date.now() + 60000 });
    expect(await store.get("s1")).not.toBeNull();

    await store.touch("s1", 3600);
    expect(await store.get("s1")).not.toBeNull();

    await store.delete("s1");
    expect(await store.get("s1")).toBeNull();
  });
});

describe("createRedisSessionStore + createSessionManager integration", () => {
  function setup(options = {}) {
    const store = createRedisSessionStore({ client: createMockRedisClient() });
    const { createSessionManager } = require("../session");
    const manager = createSessionManager(store, options);
    return { store, manager };
  }

  test("full session lifecycle", async () => {
    const { manager } = setup({ ttl: 3600 });

    const session = await manager.create({ userId: "u1", role: "admin" });
    expect(session.data.userId).toBe("u1");

    const retrieved = await manager.get(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.data.role).toBe("admin");

    await manager.update(session.id, { lastActive: "now" });
    const updated = await manager.get(session.id);
    expect(updated!.data.lastActive).toBe("now");

    await manager.touch(session.id);
    const touched = await manager.get(session.id);
    expect(touched).not.toBeNull();

    await manager.destroy(session.id);
    expect(await manager.get(session.id)).toBeNull();
  });

  test("TTL expiration works end-to-end", async () => {
    const { manager } = setup({ ttl: 1 });
    const session = await manager.create({ userId: "u1" });

    await Bun.sleep(1100);
    const result = await manager.get(session.id);
    expect(result).toBeNull();
  });
});
