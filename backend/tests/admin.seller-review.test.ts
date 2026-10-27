import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/database.js";

const adminEmail = `admin-review-${randomUUID()}@example.com`;
const applicantEmail = `seller-review-${randomUUID()}@example.com`;

const trustedOrigin = new URL(env.FRONTEND_URL).origin;
const sessionCookieName = env.SESSION_COOKIE_NAME;

const applicationData = {
  businessName: "Nairobi Review Test Supplies",
  phone: "0712345678",
  email: "review-business@example.com",
};

describe("Admin seller application review API", () => {
  let adminUserId: string;
  let applicantUserId: string;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;

    const admin = await prisma.user.create({
      data: {
        fullName: "Seller Review Admin",
        email: adminEmail,
        passwordHash: "not-used-for-login",
        roles: {
          create: { role: "ADMIN" },
        },
      },
      select: { id: true },
    });

    adminUserId = admin.id;

    const applicant = await prisma.user.create({
      data: {
        fullName: "Seller Review Applicant",
        email: applicantEmail,
        passwordHash: "not-used-for-login",
        roles: {
          create: { role: "CUSTOMER" },
        },
      },
      select: { id: true },
    });

    applicantUserId = applicant.id;
  });

  async function cleanApplicantRecords() {
    const profiles = await prisma.sellerProfile.findMany({
      where: { userId: applicantUserId },
      select: { id: true },
    });

    const profileIds = profiles.map((profile) => profile.id);

    if (profileIds.length > 0) {
      await prisma.store.deleteMany({
        where: { sellerProfileId: { in: profileIds } },
      });

      await prisma.sellerProfile.deleteMany({
        where: { id: { in: profileIds } },
      });
    }
  }

  beforeEach(async () => {
    await cleanApplicantRecords();

    await prisma.session.deleteMany({
      where: {
        userId: { in: [adminUserId, applicantUserId] },
      },
    });

    await prisma.auditLog.deleteMany({
      where: { actorUserId: adminUserId },
    });

    await prisma.roleAssignment.deleteMany({
      where: {
        userId: { in: [adminUserId, applicantUserId] },
      },
    });

    await prisma.roleAssignment.createMany({
      data: [
        { userId: adminUserId, role: "ADMIN" },
        { userId: applicantUserId, role: "CUSTOMER" },
      ],
    });

    await prisma.user.updateMany({
      where: {
        id: { in: [adminUserId, applicantUserId] },
      },
      data: { status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    await cleanApplicantRecords();

    await prisma.session.deleteMany({
      where: {
        userId: { in: [adminUserId, applicantUserId] },
      },
    });

    await prisma.auditLog.deleteMany({
      where: { actorUserId: adminUserId },
    });

    await prisma.roleAssignment.deleteMany({
      where: {
        userId: { in: [adminUserId, applicantUserId] },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: [adminUserId, applicantUserId] },
      },
    });

    await prisma.$disconnect();
  });

  async function createSessionCookie(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    return `${sessionCookieName}=${token}`;
  }

  async function createPendingApplication() {
    return prisma.sellerProfile.create({
      data: {
        userId: applicantUserId,
        ...applicationData,
        applicationStatus: "PENDING",
      },
    });
  }

  async function listApplications(
    cookie?: string,
    query = "status=PENDING&page=1&limit=10",
  ) {
    const call = request(app).get(
      `/api/v1/admin/seller-applications?${query}`,
    );

    if (cookie) {
      call.set("Cookie", cookie);
    }

    return call;
  }

  async function reviewApplication(
    applicationId: string,
    action: "approve" | "reject",
    cookie: string,
    body?: Record<string, unknown>,
  ) {
    const call = request(app)
      .patch(
        `/api/v1/admin/seller-applications/${applicationId}/${action}`,
      )
      .set("Origin", trustedOrigin)
      .set("Cookie", cookie);

    if (body) {
      call.send(body);
    }

    return call;
  }

  it("requires authentication to list applications", async () => {
    const response = await listApplications();

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("denies customers access to admin application routes", async () => {
    const cookie = await createSessionCookie(applicantUserId);

    const response = await listApplications(cookie);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("lists pending applications with pagination", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const response = await listApplications(cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: application.id,
          businessName: applicationData.businessName,
          applicationStatus: "PENDING",
        }),
      ]),
    );

    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it.each([
    ["page=0", "page"],
    ["page=-1", "page"],
    ["page=10001", "page"],
    ["page=1.5", "page"],
    ["limit=0", "limit"],
    ["limit=101", "limit"],
  ])(
    "rejects invalid pagination query %s",
    async (query, field) => {
      const cookie = await createSessionCookie(adminUserId);

      const response = await listApplications(cookie, query);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field }),
        ]),
      );
    },
  );

  it("rejects approval requests from an untrusted origin", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const response = await request(app)
      .patch(
        `/api/v1/admin/seller-applications/${application.id}/approve`,
      )
      .set("Origin", "https://untrusted.example")
      .set("Cookie", cookie);

    expect(response.status).toBe(403);

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("PENDING");
    expect(savedProfile.reviewedAt).toBeNull();

    expect(
      await prisma.store.count({
        where: { sellerProfileId: application.id },
      }),
    ).toBe(0);
  });

  it("approves an application, grants SELLER, and creates an inactive store", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const response = await reviewApplication(
      application.id,
      "approve",
      cookie,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.applicationStatus).toBe("APPROVED");
    expect(response.body.data.store.status).toBe("INACTIVE");
    expect(response.body.data.store.slug).toMatch(
      /^nairobi-review-test-supplies(?:-[a-f0-9-]+)?$/,
    );

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("APPROVED");
    expect(savedProfile.reviewedById).toBe(adminUserId);
    expect(savedProfile.reviewedAt).not.toBeNull();

    const sellerRole = await prisma.roleAssignment.findUnique({
      where: {
        userId_role: {
          userId: applicantUserId,
          role: "SELLER",
        },
      },
    });

    expect(sellerRole).not.toBeNull();

    const store = await prisma.store.findUnique({
      where: { sellerProfileId: application.id },
    });

    expect(store?.status).toBe("INACTIVE");

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        actorUserId: adminUserId,
        resourceId: application.id,
        action: "SELLER_APPLICATION_APPROVED",
      },
    });

    expect(auditLog?.outcome).toBe("SUCCESS");
  });

  it("rejects a second review of an approved application", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const firstResponse = await reviewApplication(
      application.id,
      "approve",
      cookie,
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await reviewApplication(
      application.id,
      "approve",
      cookie,
    );

    expect(secondResponse.status).toBe(409);

    expect(
      await prisma.store.count({
        where: { sellerProfileId: application.id },
      }),
    ).toBe(1);
  });

  it("rejects invalid rejection reasons without changing the application", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const response = await reviewApplication(
      application.id,
      "reject",
      cookie,
      { reason: "No" },
    );

    expect(response.status).toBe(400);

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("PENDING");
    expect(savedProfile.reviewedAt).toBeNull();
  });

  it("rejects rejection requests from an untrusted origin", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const response = await request(app)
      .patch(
        `/api/v1/admin/seller-applications/${application.id}/reject`,
      )
      .set("Origin", "https://untrusted.example")
      .set("Cookie", cookie)
      .send({
        reason: "The business information could not be verified.",
      });

    expect(response.status).toBe(403);

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("PENDING");
    expect(savedProfile.reviewedAt).toBeNull();
    expect(savedProfile.rejectionReason).toBeNull();

    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: adminUserId,
          resourceId: application.id,
          action: "SELLER_APPLICATION_REJECTED",
        },
      }),
    ).toBe(0);
  });

  it("rejects an application and records the reason and audit log", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);
    const reason =
      "The submitted business information could not be verified.";

    const response = await reviewApplication(
      application.id,
      "reject",
      cookie,
      { reason },
    );

    expect(response.status).toBe(200);
    expect(response.body.data.applicationStatus).toBe("REJECTED");
    expect(response.body.data.rejectionReason).toBe(reason);

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("REJECTED");
    expect(savedProfile.rejectionReason).toBe(reason);
    expect(savedProfile.reviewedById).toBe(adminUserId);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        actorUserId: adminUserId,
        resourceId: application.id,
        action: "SELLER_APPLICATION_REJECTED",
      },
    });

    expect(auditLog?.outcome).toBe("SUCCESS");
    expect(auditLog?.metadata).toMatchObject({
      rejectionReason: reason,
    });
  });

  it("prevents a second rejection from overwriting the original reason", async () => {
    const application = await createPendingApplication();
    const cookie = await createSessionCookie(adminUserId);

    const originalReason =
      "The submitted business information could not be verified.";

    const firstResponse = await reviewApplication(
      application.id,
      "reject",
      cookie,
      { reason: originalReason },
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await reviewApplication(
      application.id,
      "reject",
      cookie,
      { reason: "Additional review information was received." },
    );

    expect(secondResponse.status).toBe(409);

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("REJECTED");
    expect(savedProfile.rejectionReason).toBe(originalReason);

    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: adminUserId,
          resourceId: application.id,
          action: "SELLER_APPLICATION_REJECTED",
        },
      }),
    ).toBe(1);
  });

  it("returns 404 for an application that does not exist", async () => {
    const cookie = await createSessionCookie(adminUserId);

    const response = await reviewApplication(
      randomUUID(),
      "approve",
      cookie,
    );

    expect(response.status).toBe(404);
  });

  it("rolls back approval when the applicant account is suspended", async () => {
    const application = await createPendingApplication();

    await prisma.user.update({
      where: { id: applicantUserId },
      data: { status: "SUSPENDED" },
    });

    const cookie = await createSessionCookie(adminUserId);

    const response = await reviewApplication(
      application.id,
      "approve",
      cookie,
    );

    expect(response.status).toBe(409);

    const savedProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { id: application.id },
    });

    expect(savedProfile.applicationStatus).toBe("PENDING");
    expect(savedProfile.reviewedAt).toBeNull();

    expect(
      await prisma.store.count({
        where: { sellerProfileId: application.id },
      }),
    ).toBe(0);

    expect(
      await prisma.roleAssignment.findUnique({
        where: {
          userId_role: {
            userId: applicantUserId,
            role: "SELLER",
          },
        },
      }),
    ).toBeNull();

    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: adminUserId,
          resourceId: application.id,
          action: "SELLER_APPLICATION_APPROVED",
        },
      }),
    ).toBe(0);
  });
});