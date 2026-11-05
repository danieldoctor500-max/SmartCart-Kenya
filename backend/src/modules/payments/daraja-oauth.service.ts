import { env } from "../../config/env.js";

const SANDBOX_OAUTH_URL =
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

interface DarajaTokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken:
  | {
      value: string;
      expiresAt: number;
    }
  | undefined;
let tokenRequestInFlight: Promise<string> | undefined;

function getTokenResponseExpiry(value: unknown): number | undefined {
  const expiry =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(expiry) || expiry <= 0) return undefined;
  return expiry;
}

async function requestAccessToken(
  consumerKey: string,
  consumerSecret: string,
): Promise<DarajaTokenResponse> {
  let response: Response;
  try {
    response = await fetch(SANDBOX_OAUTH_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(
          `${consumerKey}:${consumerSecret}`,
        ).toString("base64")}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Daraja OAuth request failed due to a network error or timeout.");
  }

  if (!response.ok) {
    throw new Error(
      `Daraja OAuth request failed with HTTP status ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Daraja OAuth returned an invalid JSON response.");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Daraja OAuth returned a malformed token response.");
  }

  const tokenResponse = payload as Record<string, unknown>;
  const accessToken = tokenResponse.access_token;
  const expiresIn = getTokenResponseExpiry(tokenResponse.expires_in);
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length === 0 ||
    expiresIn === undefined
  ) {
    throw new Error("Daraja OAuth returned a malformed token response.");
  }

  return { access_token: accessToken, expires_in: expiresIn };
}

export async function getDarajaAccessToken(): Promise<string> {
  if (env.MPESA_ENVIRONMENT !== "sandbox") {
    throw new Error("Daraja OAuth is available only in the sandbox environment.");
  }

  const consumerKey = env.MPESA_CONSUMER_KEY;
  const consumerSecret = env.MPESA_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error("Daraja sandbox consumer credentials are not configured.");
  }

  const now = Date.now();
  if (
    cachedToken &&
    now < cachedToken.expiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS
  ) {
    return cachedToken.value;
  }
  cachedToken = undefined;

  if (tokenRequestInFlight) return tokenRequestInFlight;

  const request = requestAccessToken(consumerKey, consumerSecret)
    .then(({ access_token, expires_in }) => {
      const expiresAt = Date.now() + expires_in * 1000;
      if (!Number.isFinite(expiresAt)) {
        throw new Error("Daraja OAuth returned an invalid token expiry.");
      }

      cachedToken = { value: access_token, expiresAt };
      return access_token;
    })
    .finally(() => {
      if (tokenRequestInFlight === request) {
        tokenRequestInFlight = undefined;
      }
    });

  tokenRequestInFlight = request;
  return request;
}
