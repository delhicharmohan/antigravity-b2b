import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// We need to mock 'pg' BEFORE importing the db module because db.ts instantiates Pool immediately
mock.module("pg", () => {
  return {
    Pool: class {
        on() {}
        query() {}
        connect() {}
    }
  };
});

describe("Database Hardening", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Clear relevant env vars
        delete process.env.DATABASE_URL;
        delete process.env.POSTGRES_USER;
        delete process.env.POSTGRES_HOST;
        delete process.env.POSTGRES_DB;
        delete process.env.POSTGRES_PASSWORD;
        delete process.env.POSTGRES_PORT;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("should throw an error if no database configuration is provided", async () => {
        // Clear all to be sure
        delete process.env.DATABASE_URL;
        delete process.env.POSTGRES_USER;
        delete process.env.POSTGRES_HOST;
        delete process.env.POSTGRES_DB;
        delete process.env.POSTGRES_PASSWORD;

        try {
            // Use a cache-busting query param to ensure the module is re-evaluated
            await import(`../src/config/db?t=initial`);
            // If it doesn't throw, we fail the test
            expect(true).toBe(false);
        } catch (error: any) {
            expect(error.message).toContain("Database configuration error");
        }
    });

    it("should NOT throw an error if DATABASE_URL is provided", async () => {
        process.env.DATABASE_URL = "postgres://user:pass@host:5432/db";

        // Use a cache-busting query param to ensure the module is re-evaluated
        const db = await import(`../src/config/db?t=${Date.now()}`);
        expect(db).toBeDefined();
    });

    it("should NOT throw an error if all individual POSTGRES_* vars are provided", async () => {
        process.env.POSTGRES_USER = "user";
        process.env.POSTGRES_HOST = "localhost";
        process.env.POSTGRES_DB = "db";
        process.env.POSTGRES_PASSWORD = "pass";

        const db = await import(`../src/config/db?t=${Date.now() + 1}`);
        expect(db).toBeDefined();
    });

    it("should throw an error if one of the individual POSTGRES_* vars is missing", async () => {
        process.env.POSTGRES_USER = "user";
        process.env.POSTGRES_HOST = "localhost";
        process.env.POSTGRES_DB = "db";
        // POSTGRES_PASSWORD is missing

        try {
            await import(`../src/config/db?t=${Date.now() + 2}`);
            expect(true).toBe(false);
        } catch (error: any) {
            expect(error.message).toContain("Database configuration error");
        }
    });
});
