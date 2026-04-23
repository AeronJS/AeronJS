import { createExampleApp } from "../../src/app";
import { createTestApp, createTestClient } from "@ventostack/testing";
import { createTestDatabase } from "../setup";
import type { TestAppInstance, TestClient } from "@ventostack/testing";

export async function setupIntegrationTest(jwtSecret = "test-secret-key-at-least-32-bytes-long!!") {
  const { db } = await createTestDatabase();
  const { app, userService, authService } = await createExampleApp({
    db,
    config: { port: 0, jwtSecret },
  });

  const testApp = await createTestApp(app);
  const client = createTestClient(testApp.baseUrl);

  return { app, db, userService, authService, testApp, client };
}

export async function teardownIntegrationTest(testApp: TestAppInstance) {
  await testApp.close();
}
