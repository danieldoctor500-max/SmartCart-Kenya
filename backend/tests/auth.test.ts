
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { prisma } from "../src/config/database.js";

const password = "SmartCart-Test-Password-2026!";
const email = `auth-test-${randomUUID()}@example.com`;

describe("Authentication API integration tests", () => {
  beforeAll(async () => {
    // Confirm that the test database is reachable before testing.
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    // Delete only the uniquely identified test account.
    await prisma.user.deleteMany({
      where: { email },
    });

    await prisma.$disconnect();
  });

  it("registers a customer without exposing the password hash", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "SmartCart Test Customer",
        email,
        password,
        phone: "0712345678",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.roles).toContainEqual({
      role: "CUSTOMER",
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");

    const savedUser = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });

    expect(savedUser).not.toBeNull();
    expect(savedUser!.passwordHash).not.toBe(password);
    expect(savedUser!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects registration with invalid input", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "A",
        email: "not-an-email",
        password: "short",
      });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate email registration", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        fullName: "Duplicate Test Customer",
        email,
        password,
      });

    expect(response.status).toBe(409);
  });

  it("rejects access to the current-user endpoint without a session", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
  });

  it("logs in, validates the session, and logs out", async () => {
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .send({ email, password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.user.email).toBe(email);

    const setCookie = loginResponse.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie!.join(";")).toContain("HttpOnly");

    const currentUserResponse = await agent.get("/api/v1/auth/me");

    expect(currentUserResponse.status).toBe(200);
    expect(currentUserResponse.body.data.user.email).toBe(email);

    const logoutResponse = await agent.post("/api/v1/auth/logout");

    expect(logoutResponse.status).toBe(200);

    const afterLogoutResponse = await agent.get("/api/v1/auth/me");

    expect(afterLogoutResponse.status).toBe(401);
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email,
        password: "Incorrect-Test-Password-2026!",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
