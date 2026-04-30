import { describe, expect, test } from "bun:test";
import { createMemorySessionStore, createSessionManager } from "../session";

describe("createSessionManager", () => {
  function setup(options = {}) {
    const store = createMemorySessionStore();
    const manager = createSessionManager(store, options);
    return { store, manager };
  }

  describe("create", () => {
    test("creates a session with a UUID id", async () => {
      const { manager } = setup();
      const session = await manager.create();
      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    test("creates a session with data", async () => {
      const { manager } = setup();
      const session = await manager.create({ userId: "u1", role: "admin" });
      expect(session.data.userId).toBe("u1");
      expect(session.data.role).toBe("admin");
    });

    test("creates a session with expiresAt in the future", async () => {
      const { manager } = setup({ ttl: 100 });
      const before = Date.now();
      const session = await manager.create();
      expect(session.expiresAt).toBeGreaterThanOrEqual(before + 100 * 1000);
    });

    test("default TTL is 3600s", async () => {
      const { manager } = setup();
      const now = Date.now();
      const session = await manager.create();
      // Allow 1s tolerance
      expect(session.expiresAt).toBeGreaterThanOrEqual(now + 3599 * 1000);
      expect(session.expiresAt).toBeLessThanOrEqual(now + 3601 * 1000);
    });
  });

  describe("get", () => {
    test("retrieves an existing session", async () => {
      const { manager } = setup();
      const session = await manager.create({ key: "value" });
      const retrieved = await manager.get(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
      expect(retrieved!.data.key).toBe("value");
    });

    test("returns null for non-existent session", async () => {
      const { manager } = setup();
      const result = await manager.get("non-existent-id");
      expect(result).toBeNull();
    });

    test("returns null for expired session", async () => {
      const { manager } = setup({ ttl: 0 });
      const session = await manager.create();
      // TTL=0 means already expired
      // Need a small delay to ensure expiration
      await Bun.sleep(5);
      const result = await manager.get(session.id);
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    test("updates session data", async () => {
      const { manager } = setup();
      const session = await manager.create({ a: 1 });
      await manager.update(session.id, { b: 2 });
      const updated = await manager.get(session.id);
      expect(updated!.data.a).toBe(1);
      expect(updated!.data.b).toBe(2);
    });

    test("overwrites existing keys", async () => {
      const { manager } = setup();
      const session = await manager.create({ a: 1 });
      await manager.update(session.id, { a: 99 });
      const updated = await manager.get(session.id);
      expect(updated!.data.a).toBe(99);
    });

    test("does nothing for non-existent session", async () => {
      const { manager } = setup();
      // Should not throw
      await manager.update("non-existent", { a: 1 });
    });
  });

  describe("destroy", () => {
    test("destroys a session", async () => {
      const { manager } = setup();
      const session = await manager.create();
      await manager.destroy(session.id);
      const result = await manager.get(session.id);
      expect(result).toBeNull();
    });

    test("does nothing for non-existent session", async () => {
      const { manager } = setup();
      // Should not throw
      await manager.destroy("non-existent");
    });
  });

  describe("touch", () => {
    test("extends session TTL", async () => {
      const { manager } = setup({ ttl: 10 });
      const session = await manager.create();
      const originalExpiry = session.expiresAt;

      await Bun.sleep(50);
      await manager.touch(session.id);

      const updated = await manager.get(session.id);
      expect(updated).not.toBeNull();
      expect(updated!.expiresAt).toBeGreaterThan(originalExpiry);
    });

    test("does not revive expired sessions", async () => {
      const { manager } = setup({ ttl: 0 });
      const session = await manager.create();

      await Bun.sleep(5);
      await manager.touch(session.id);

      const updated = await manager.get(session.id);
      expect(updated).toBeNull();
    });
  });

  describe("prefix", () => {
    test("uses custom prefix", async () => {
      const store = createMemorySessionStore();
      const manager = createSessionManager(store, { prefix: "custom:" });
      const session = await manager.create();
      // The prefixed key should be in the store
      const fromStore = await store.get(`custom:${session.id}`);
      expect(fromStore).not.toBeNull();
    });
  });

  describe("destroyByUser", () => {
    test("destroys all sessions for a user", async () => {
      const { manager } = setup();
      await manager.create({ userId: "user1" });
      await manager.create({ userId: "user1" });
      await manager.create({ userId: "user2" });

      const count = await manager.destroyByUser("user1");
      expect(count).toBe(2);
    });

    test("returns correct count", async () => {
      const { manager } = setup();
      await manager.create({ userId: "user1" });
      await manager.create({ userId: "user1" });
      await manager.create({ userId: "user1" });

      const count = await manager.destroyByUser("user1");
      expect(count).toBe(3);
    });

    test("with no sessions returns 0", async () => {
      const { manager } = setup();
      const count = await manager.destroyByUser("nonexistent");
      expect(count).toBe(0);
    });

    test("does not affect other users' sessions", async () => {
      const { manager } = setup();
      const s1 = await manager.create({ userId: "user1" });
      await manager.create({ userId: "user1" });
      const s3 = await manager.create({ userId: "user2" });

      await manager.destroyByUser("user1");

      // user2's session should still exist
      const result = await manager.get(s3.id);
      expect(result).not.toBeNull();

      // user1's sessions should be gone
      expect(await manager.get(s1.id)).toBeNull();
    });

    test("delegates to store.deleteByUser when available", async () => {
      const store = createMemorySessionStore();
      let deleteByUserCalled = false;
      const storeWithDeleteByUser = {
        ...store,
        async deleteByUser(userId: string): Promise<number> {
          deleteByUserCalled = true;
          return 42;
        },
      };
      const manager = createSessionManager(storeWithDeleteByUser);
      const count = await manager.destroyByUser("user1");
      expect(deleteByUserCalled).toBe(true);
      expect(count).toBe(42);
    });
  });
});

describe("createMemorySessionStore", () => {
  test("implements SessionStore interface", async () => {
    const store = createMemorySessionStore();
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
    expect(touched!.expiresAt).toBeGreaterThanOrEqual(Date.now() + 119000);

    await store.delete("test-id");
    const deleted = await store.get("test-id");
    expect(deleted).toBeNull();
  });

  test("returns null for expired entries", async () => {
    const store = createMemorySessionStore();
    await store.set({
      id: "expired",
      data: {},
      expiresAt: Date.now() - 1000,
    });
    const result = await store.get("expired");
    expect(result).toBeNull();
  });
});
