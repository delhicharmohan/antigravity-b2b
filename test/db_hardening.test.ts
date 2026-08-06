import { expect, test, describe, beforeEach, mock } from "bun:test";

// Mock pg to prevent actual connection attempts
mock.module("pg", () => {
  return {
    Pool: class {
      on() { return this; }
      query() {}
      connect() {}
    },
  };
});

// Mock dotenv to prevent it from loading .env file during tests
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

    // Specifically clear relevant env vars for the tests
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_USER;
    delete process.env.POSTGRES_HOST;
    delete process.env.POSTGRES_DB;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.POSTGRES_PORT;
  });

  test("should throw an error when required database environment variables are missing", async () => {
    let error: any;
    try {
        // Cache busting to ensure fresh evaluation
        await import("../src/config/db.ts?cache=" + Math.random());
    } catch (e: any) {
        error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain("Missing required database configuration");
  });

  test("should initialize correctly when DATABASE_URL is provided", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@host:5432/db";
    const db = await import("../src/config/db.ts?cache=" + Math.random());
    expect(db).toBeDefined();
  });

  test("should initialize correctly when individual variables are provided", async () => {
    process.env.POSTGRES_USER = "user";
    process.env.POSTGRES_HOST = "host";
    process.env.POSTGRES_DB = "db";
    process.env.POSTGRES_PASSWORD = "pass";
    const db = await import("../src/config/db.ts?cache=" + Math.random());
    expect(db).toBeDefined();
  });
});
