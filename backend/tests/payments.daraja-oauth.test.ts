import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const isolatedEnvironment = {
  SMARTCART_BROWSER_TEST: "1",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://isolated-test:isolated-test@localhost:5432/unused",
  MPESA_ENVIRONMENT: "sandbox",
  MPESA_CONSUMER_KEY: "test-consumer-key",
  MPESA_CONSUMER_SECRET: "test-consumer-secret",
} as const;
const environmentKeys = Object.keys(isolatedEnvironment);
const originalEnvironment = new Map(
  environmentKeys.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  Object.assign(process.env, isolatedEnvironment);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();

  for (const key of environmentKeys) {
    const originalValue = originalEnvironment.get(key);
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

async function loadOAuthService(
  overrides: Partial<Record<keyof typeof isolatedEnvironment, string | undefined>> = {},
) {
  Object.assign(process.env, isolatedEnvironment);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import("../src/modules/payments/daraja-oauth.service.js");
}

function tokenResponse(
  accessToken: unknown = "sandbox-access-token",
  expiresIn: unknown = 3600,
) {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("Daraja sandbox OAuth", () => {
  it("acquires a valid token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenResponse()));
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).resolves.toBe(
      "sandbox-access-token",
    );
  });

  it("uses the Sandbox URL and HTTP Basic authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getDarajaAccessToken } = await loadOAuthService();

    await getDarajaAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            "test-consumer-key:test-consumer-secret",
          ).toString("base64")}`,
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("caches a token before the safety margin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).resolves.toBe(
      "sandbox-access-token",
    );
    await expect(getDarajaAccessToken()).resolves.toBe(
      "sandbox-access-token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(responsePromise);
    vi.stubGlobal("fetch", fetchMock);
    const { getDarajaAccessToken } = await loadOAuthService();

    const first = getDarajaAccessToken();
    const second = getDarajaAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(tokenResponse());
    await expect(Promise.all([first, second])).resolves.toEqual([
      "sandbox-access-token",
      "sandbox-access-token",
    ]);
  });

  it.each(["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET"] as const)(
    "rejects when %s is missing without making a request",
    async (missingCredential) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { getDarajaAccessToken } = await loadOAuthService({
        [missingCredential]: undefined,
      });

      await expect(getDarajaAccessToken()).rejects.toThrow(
        "Daraja sandbox consumer credentials are not configured.",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects non-success HTTP statuses without reading the response body", async () => {
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json }),
    );
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).rejects.toThrow(
      "HTTP status 401",
    );
    expect(json).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
      }),
    );
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).rejects.toThrow(
      "Daraja OAuth returned an invalid JSON response.",
    );
  });

  it.each([
    ["missing token", { expires_in: 3600 }],
    ["empty token", { access_token: "   ", expires_in: 3600 }],
    ["non-string token", { access_token: 123, expires_in: 3600 }],
    ["missing expiry", { access_token: "token" }],
    ["zero expiry", { access_token: "token", expires_in: 0 }],
    ["negative expiry", { access_token: "token", expires_in: -1 }],
    ["non-numeric expiry", { access_token: "token", expires_in: "later" }],
    ["infinite expiry", { access_token: "token", expires_in: "Infinity" }],
  ])("rejects a malformed token response (%s)", async (_case, payload) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).rejects.toThrow(
      "Daraja OAuth returned a malformed token response.",
    );
  });

  it("accepts Daraja's numeric-string expiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenResponse("token", "3600")));
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).resolves.toBe("token");
  });

  it("clears a failed in-flight request so a later call can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce(tokenResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).rejects.toThrow(
      "network error or timeout",
    );
    await expect(getDarajaAccessToken()).resolves.toBe(
      "sandbox-access-token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("applies a finite timeout and safely rejects when it aborts", async () => {
    const controller = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const fetchMock = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "TimeoutError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getDarajaAccessToken } = await loadOAuthService();

    const pending = getDarajaAccessToken();
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.abort();

    await expect(pending).rejects.toThrow("network error or timeout");
  });

  it("refreshes a token when it enters the 60-second expiry margin", async () => {
    const now = 1_000_000;
    let currentTime = now;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("first-token", 120))
      .mockResolvedValueOnce(tokenResponse("second-token", 120));
    vi.stubGlobal("fetch", fetchMock);
    const { getDarajaAccessToken } = await loadOAuthService();

    await expect(getDarajaAccessToken()).resolves.toBe("first-token");
    currentTime += 61_000;
    await expect(getDarajaAccessToken()).resolves.toBe("second-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects when configured for a non-sandbox environment", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadOAuthService({ MPESA_ENVIRONMENT: "production" }),
    ).rejects.toThrow(
      "Please correct the root .env configuration.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
