import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyNeonAuthWebhook } from "./neon-auth-webhook.js";

const kid = "test-ed25519-key";
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const jwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid, alg: "EdDSA", use: "sig" };

function signedRequest(payload: Record<string, unknown>, timestamp = Date.now()) {
  const rawBody = JSON.stringify(payload);
  const protectedHeader = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWS", kid })).toString("base64url");
  const timestampRaw = String(timestamp);
  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signaturePayloadB64 = Buffer.from(`${timestampRaw}.${payloadB64}`, "utf8").toString("base64url");
  const signingInput = `${protectedHeader}.${signaturePayloadB64}`;
  const signature = crypto.sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
  return {
    rawBody,
    headers: {
      "x-neon-signature": `${protectedHeader}..${signature}`,
      "x-neon-signature-kid": kid,
      "x-neon-timestamp": timestampRaw,
      "x-neon-event-type": String(payload.event_type),
      "x-neon-event-id": String(payload.event_id),
    },
  };
}

const eventId = "550e8400-e29b-41d4-a716-446655440000";
const basePayload = {
  event_id: eventId,
  event_type: "user.created",
  timestamp: new Date().toISOString(),
  user: {
    id: "a1b2c3d4-e5f6-4789-8abc-ef1234567890",
    email: "new.user@example.com",
    name: "New User",
  },
};

const fetchImpl = (async () => new Response(JSON.stringify({ keys: [jwk] }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
})) as typeof fetch;

describe("Neon Auth detached webhook signature verification", () => {
  it("accepts a valid Ed25519 detached JWS and returns its signed event", async () => {
    const request = signedRequest(basePayload, 1_800_000_000_000);
    const verified = await verifyNeonAuthWebhook(request.rawBody, request.headers, {
      jwksUrl: "https://auth.example.test/.well-known/jwks.json",
      nowMs: 1_800_000_000_000,
      fetchImpl,
    });
    expect(verified.eventId).toBe(eventId);
    expect(verified.eventType).toBe("user.created");
    expect((verified.payload.user as Record<string, unknown>).email).toBe("new.user@example.com");
  });

  it("rejects a modified body", async () => {
    const request = signedRequest(basePayload, 1_800_000_000_000);
    await expect(verifyNeonAuthWebhook(request.rawBody + " ", request.headers, {
      jwksUrl: "https://auth.example.test/.well-known/jwks.json",
      nowMs: 1_800_000_000_000,
      fetchImpl,
    })).rejects.toThrow(/signature is invalid/i);
  });

  it("rejects stale timestamps before fetching signing keys", async () => {
    const request = signedRequest(basePayload, 1_700_000_000_000);
    await expect(verifyNeonAuthWebhook(request.rawBody, request.headers, {
      jwksUrl: "https://auth.example.test/.well-known/jwks.json",
      nowMs: 1_800_000_000_000,
      fetchImpl: (async () => { throw new Error("must not fetch"); }) as typeof fetch,
    })).rejects.toThrow(/outside the accepted window/i);
  });

  it("rejects event header and signed body mismatch", async () => {
    const request = signedRequest(basePayload, 1_800_000_000_000);
    request.headers["x-neon-event-type"] = "user.deleted";
    await expect(verifyNeonAuthWebhook(request.rawBody, request.headers, {
      jwksUrl: "https://auth.example.test/.well-known/jwks.json",
      nowMs: 1_800_000_000_000,
      fetchImpl,
    })).rejects.toThrow(/headers do not match/i);
  });

  it("rejects non-HTTPS JWKS endpoints", async () => {
    const request = signedRequest(basePayload, 1_800_000_000_000);
    await expect(verifyNeonAuthWebhook(request.rawBody, request.headers, {
      jwksUrl: "http://auth.example.test/jwks",
      nowMs: 1_800_000_000_000,
      fetchImpl,
    })).rejects.toThrow(/HTTPS/i);
  });
});
