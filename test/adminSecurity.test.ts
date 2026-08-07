import { describe, it, expect, mock, beforeEach } from "bun:test";
import { adminLogin } from "../src/controllers/adminController";
import { authenticateAdmin } from "../src/middleware/auth";
import { Request, Response } from "express";

// Mock LoggerService
mock.module("../src/services/loggerService", () => ({
    LoggerService: {
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        info: mock(() => Promise.resolve()),
    }
}));

// Mock pg
mock.module("../src/config/db", () => ({
    query: mock(() => Promise.resolve({ rows: [] })),
}));

describe("Admin Security", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let statusMock: any;
    let jsonMock: any;
    let nextMock: any;

    beforeEach(() => {
        statusMock = mock(() => mockRes);
        jsonMock = mock(() => mockRes);
        nextMock = mock(() => {});
        mockRes = {
            status: statusMock,
            json: jsonMock,
        };
        // Reset process.env.ADMIN_SECRET before each test
        delete process.env.ADMIN_SECRET;
    });

    describe("adminLogin", () => {
        it("should fail with 500 if ADMIN_SECRET is not set", async () => {
            mockReq = { body: { password: "any" } };
            await adminLogin(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(500);
            expect(jsonMock).toHaveBeenCalledWith({ error: "Admin login is not configured" });
        });

        it("should fail with 401 if password is incorrect", async () => {
            process.env.ADMIN_SECRET = "actual_secret";
            mockReq = { body: { password: "wrong_password" } };
            await adminLogin(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(401);
            expect(jsonMock).toHaveBeenCalledWith({ error: "Invalid admin credentials" });
        });

        it("should fail with 401 if trying the old hardcoded fallback when a secret is set", async () => {
            process.env.ADMIN_SECRET = "new_secure_secret";
            mockReq = { body: { password: "antigravity_admin_2024" } };
            await adminLogin(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(401);
        });

        it("should succeed with 200 if password is correct", async () => {
            process.env.ADMIN_SECRET = "correct_secret";
            mockReq = { body: { password: "correct_secret" } };
            await adminLogin(mockReq as Request, mockRes as Response);
            expect(jsonMock).toHaveBeenCalledWith({ success: true, token: "correct_secret" });
        });
    });

    describe("authenticateAdmin middleware", () => {
        it("should fail with 500 if ADMIN_SECRET is not set", async () => {
            mockReq = { header: mock(() => "Bearer token") };
            await authenticateAdmin(mockReq as Request, mockRes as Response, nextMock);
            expect(statusMock).toHaveBeenCalledWith(500);
            expect(jsonMock).toHaveBeenCalledWith({ error: "Admin access is not configured" });
            expect(nextMock).not.toHaveBeenCalled();
        });

        it("should fail with 401 if Authorization header is missing", async () => {
            process.env.ADMIN_SECRET = "secret";
            mockReq = { header: mock(() => undefined) };
            await authenticateAdmin(mockReq as Request, mockRes as Response, nextMock);
            expect(statusMock).toHaveBeenCalledWith(401);
            expect(nextMock).not.toHaveBeenCalled();
        });

        it("should fail with 403 if token is incorrect", async () => {
            process.env.ADMIN_SECRET = "actual_secret";
            mockReq = {
                header: mock((name) => name === 'Authorization' ? "Bearer wrong_token" : undefined),
                ip: "127.0.0.1"
            };
            await authenticateAdmin(mockReq as Request, mockRes as Response, nextMock);
            expect(statusMock).toHaveBeenCalledWith(403);
            expect(nextMock).not.toHaveBeenCalled();
        });

        it("should call next() if token is correct", async () => {
            process.env.ADMIN_SECRET = "correct_token";
            mockReq = {
                header: mock((name) => name === 'Authorization' ? "Bearer correct_token" : undefined)
            };
            await authenticateAdmin(mockReq as Request, mockRes as Response, nextMock);
            expect(nextMock).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
        });
    });
});
