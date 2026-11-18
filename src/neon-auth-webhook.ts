import crypto from "node:crypto";

export interface NeonAuthWebhookHeaders {
  "x-neon-signature"?: string;
  "x-neon-signature-kid"?: string;
  "x-neon-timestamp"?: string;
  "x-neon-event-type"?: string;
  "x-neon-event-id"?: string;
}

export interface VerifiedNeonAuthWebhook {
  eventId: string;
  eventType: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

interface VerifyOptions {
  jwksUrl: string;
  nowMs?: number;
  toleranceMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeBase64UrlJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid webhook signature header.");
  }
  return parsed as Record<string, unknown>;
}

export async function verifyNeonAuthWebhook(
  rawBody: string,
  headers: NeonAuthWebhookHeaders,
  options: VerifyOptions,
): Promise<VerifiedNeonAuthWebhook> {
  const signature = headers["x-neon-signature"];
  const kid = headers["x-neon-signature-kid"];
  const timestampRaw = headers["x-neon-timestamp"];
  const eventTypeHeader = headers["x-neon-event-type"];
  const eventIdHeader = headers["x-neon-event-id"];

  if (!signature || !kid || !timestampRaw || !eventTypeHeader || !eventIdHeader) {
    throw new Error("Required Neon Auth webhook headers are missing.");
  }
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
    throw new Error("Webhook body is empty or too large.");
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Invalid webhook timestamp.");
  }
  const nowMs = options.nowMs ?? Date.now();
  const toleranceMs = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  if (Math.abs(nowMs - timestamp) > toleranceMs) {
    throw new Error("Webhook timestamp is outside the accepted window.");
  }

  const parts = signature.split(".");
  if (parts.length !== 3 || parts[1] !== "" || !parts[0] || !parts[2]) {
    throw new Error("Expected a detached JWS signature.");
  }
  const protectedHeader = decodeBase64UrlJson(parts[0]);
  if (protectedHeader.alg !== "EdDSA" || protectedHeader.kid !== kid) {
    throw new Error("Webhook signature algorithm or key id is invalid.");
  }

  const jwks = new URL(options.jwksUrl);
  if (jwks.protocol !== "https:") {
    throw new Error("Neon Auth JWKS URL must use HTTPS.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let jwksResponse: Response;
  try {
    jwksResponse = await (options.fetchImpl ?? fetch)(jwks.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!jwksResponse.ok) throw new Error("Neon Auth signing keys are unavailable.");

  const jwksPayload: unknown = await jwksResponse.json();
  if (!jwksPayload || typeof jwksPayload !== "object" || !Array.isArray((jwksPayload as any).keys)) {
    throw new Error("Neon Auth signing keys response is invalid.");
  }
  const jwk = (jwksPayload as { keys: Array<Record<string, unknown>> }).keys.find((key) => key.kid === kid);
  if (!jwk || jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    throw new Error("Matching Ed25519 signing key was not found.");
  }

  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signaturePayloadB64 = Buffer.from(`${timestampRaw}.${payloadB64}`, "utf8").toString("base64url");
  const signingInput = `${parts[0]}.${signaturePayloadB64}`;
  const publicKey = crypto.createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
  const valid = crypto.verify(
    null,
    Buffer.from(signingInput, "utf8"),
    publicKey,
    Buffer.from(parts[2], "base64url"),
  );
  if (!valid) throw new Error("Neon Auth webhook signature is invalid.");

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("Webhook body is not valid JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Webhook payload must be an object.");
  }
  const event = payload as Record<string, unknown>;
  if (event.event_id !== eventIdHeader || event.event_type !== eventTypeHeader) {
    throw new Error("Webhook event headers do not match the signed payload.");
  }
  if (typeof event.event_id !== "string" || !UUID_PATTERN.test(event.event_id)) {
    throw new Error("Webhook event id is invalid.");
  }

  return {
    eventId: event.event_id,
    eventType: String(event.event_type),
    timestamp,
    payload: event,
  };
}
