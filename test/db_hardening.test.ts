import { expect, test, describe, mock, beforeEach } from "bun:test";

// Mock pg to avoid connection attempts and missing package errors
mock.module("pg", () => {
  return {
    Pool: class {
      on() {}
    },
  };
});

// Mock dotenv to avoid it loading the real .env file and overriding our test env
mock.module("dotenv", () => {
  return {
    config: () => ({}),
    default: {
      config: () => ({})
    }
  };
});

describe("Database Configuration Hardening", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env before each test
    for (const key in process.env) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  test("should throw error if all database config is missing", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_USER;
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_DB;
    delete process.env.POSTGRES_PASSWORD;

    try {
      // Use cache-busting for dynamic import to ensure the module is re-evaluated
      await import(`../src/config/db.ts?test=${Math.random()}`);
      throw new Error("Should have thrown");
    } catch (e: any) {
      expect(e.message).toBe("Database configuration missing. Either DATABASE_URL or all individual POSTGRES_* variables must be provided.");
    }
  });

  test("should throw error if some database config is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_USER = "user";
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_DB;
    delete process.env.POSTGRES_PASSWORD;

    try {
      await import(`../src/config/db.ts?test=${Math.random()}`);
      throw new Error("Should have thrown");
    } catch (e: any) {
      expect(e.message).toBe("Database configuration missing. Either DATABASE_URL or all individual POSTGRES_* variables must be provided.");
    }
  });

  test("should not throw error if DATABASE_URL is provided", async () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/db";

    const db = await import(`../src/config/db.ts?test=${Math.random()}`);
    expect(db).toBeDefined();
  });

  test("should not throw error if all individual POSTGRES variables are provided", async () => {
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_USER = "user";
    process.env.POSTGRES_HOST = "localhost";
    process.env.POSTGRES_DB = "db";
    process.env.POSTGRES_PASSWORD = "password";

    const db = await import(`../src/config/db.ts?test=${Math.random()}`);
    expect(db).toBeDefined();
  });
});
