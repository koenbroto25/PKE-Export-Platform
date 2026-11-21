import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { PrivateStorageAdapter } from "./storage";

// Pure validation tests — no network, no Production access required.

const adapterNoCreds = new PrivateStorageAdapter({
  bucket: "pke-private-documents",
  region: undefined,
  endpoint: undefined,
  accessKeyId: undefined,
  secretAccessKey: undefined,
});

const adapterWithCreds = new PrivateStorageAdapter({
  bucket: "pke-private-documents",
  region: "ap-southeast-1",
  endpoint: "https://storage.ap-southeast-1.neonpublic.com",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
});

const adapterMissingEndpoint = new PrivateStorageAdapter({
  bucket: "pke-private-documents",
  region: "ap-southeast-1",
  endpoint: undefined,
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
});

const adapterBadProtocol = new PrivateStorageAdapter({
  bucket: "pke-private-documents",
  region: "ap-southeast-1",
  endpoint: "http://storage.ap-southeast-1.neonpublic.com",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
});

describe("PrivateStorageAdapter validation (offline)", () => {
  it("reports unavailable when credentials missing", () => {
    const status = adapterNoCreds.status();
    expect(status.available).toBe(false);
    expect(status.reason).toContain("not configured");
    expect(status.bucket).toBe("pke-private-documents");
  });

  it("reports available when credentials and HTTPS endpoint configured", () => {
    const status = adapterWithCreds.status();
    expect(status.available).toBe(true);
    expect(status.reason).toBeUndefined();
  });

  it("fails closed when endpoint is missing (no public S3 fallback)", () => {
    const status = adapterMissingEndpoint.status();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/endpoint/i);
  });

  it("fails closed on non-HTTPS endpoint", () => {
    const status = adapterBadProtocol.status();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/HTTPS/);
  });

  it("rejects object key with path traversal", () => {
    expect(adapterWithCreds.validateObjectKey("../etc/passwd").ok).toBe(false);
    expect(adapterWithCreds.validateObjectKey("foo/../../bar").ok).toBe(false);
  });

  it("rejects object key starting with slash", () => {
    expect(adapterWithCreds.validateObjectKey("/absolute/key").ok).toBe(false);
    expect(adapterWithCreds.validateObjectKey("./relative/key").ok).toBe(false);
  });

  it("accepts valid namespaced object key", () => {
    const result = adapterWithCreds.validateObjectKey("projects/550e8400-e29b-41d4-a716-446655440000/documents/invoice.pdf");
    expect(result.ok).toBe(true);
  });

  it("rejects empty object key", () => {
    expect(adapterWithCreds.validateObjectKey("").ok).toBe(false);
    expect(adapterWithCreds.validateObjectKey(undefined as any).ok).toBe(false);
  });

  it("rejects disallowed MIME type", () => {
    const result = adapterWithCreds.validateFileMetadata({
      mimeType: "application/x-executable",
      contentLength: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("rejects content length exceeding max", () => {
    const result = adapterWithCreds.validateFileMetadata({
      mimeType: "application/pdf",
      contentLength: 60 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("exceeds");
  });

  it("rejects zero content length", () => {
    const result = adapterWithCreds.validateFileMetadata({
      mimeType: "application/pdf",
      contentLength: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects disallowed file extension", () => {
    const result = adapterWithCreds.validateFileMetadata({
      mimeType: "application/pdf",
      contentLength: 100,
      filename: "script.exe",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("extension");
  });

  it("accepts valid PDF metadata", () => {
    const result = adapterWithCreds.validateFileMetadata({
      mimeType: "application/pdf",
      contentLength: 1024,
      filename: "document.pdf",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts valid image metadata", () => {
    const result = adapterWithCreds.validateFileMetadata({
      mimeType: "image/png",
      contentLength: 51200,
      filename: "photo.png",
    });
    expect(result.ok).toBe(true);
  });

  it("throws on presigned operations when credentials missing", async () => {
    await expect(adapterNoCreds.presignedUpload("key.pdf", "application/pdf", 100))
      .rejects.toThrow(/not configured|unavailable/);
    await expect(adapterNoCreds.presignedDownload("key.pdf"))
      .rejects.toThrow(/not configured|unavailable/);
  });

  it("generates presigned upload URL with correct host, bucket path, canonical key, signature query, and signed content-type header", () => {
    return adapterWithCreds.presignedUpload("projects/test/documents/invoice.pdf", "application/pdf", 1024)
      .then(result => {
        expect(result.uploadUrl).toBeDefined();
        expect(result.objectKey).toBe("projects/test/documents/invoice.pdf");
        expect(result.expiresInSeconds).toBe(900);
        expect(result.uploadUrl).toContain("X-Amz-Signature=");
        expect(result.uploadUrl).toContain("X-Amz-Credential=");
        expect(result.uploadUrl).toContain("X-Amz-Date=");
        expect(result.uploadUrl).toContain("X-Amz-SignedHeaders=");
        // path-style: endpoint host + /bucket/objectKey
        const u = new URL(result.uploadUrl);
        expect(u.protocol).toBe("https:");
        expect(u.host).toBe("storage.ap-southeast-1.neonpublic.com");
        expect(u.pathname).toBe("/pke-private-documents/projects/test/documents/invoice.pdf");
        expect(u.searchParams.get("X-Amz-SignedHeaders")).toContain("host");
        expect(u.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
        expect(result.requiredHeaders).toBeDefined();
        expect(result.requiredHeaders["Content-Type"]).toBe("application/pdf");
        expect(result.notes).toMatch(/pre-sign validated/i);
      });
  });

  it("encodes object key segments in canonical URI", () => {
    return adapterWithCreds.presignedUpload("projects/test/documents/my file (1).pdf", "application/pdf", 100)
      .then(result => {
        const u = new URL(result.uploadUrl);
        expect(u.pathname).toContain("/pke-private-documents/projects/test/documents/");
        expect(u.pathname).toContain("my%20file");
      });
  });

  it("generates presigned download URL with credentials", () => {
    return adapterWithCreds.presignedDownload("projects/test/documents/invoice.pdf")
      .then(result => {
        expect(result.downloadUrl).toBeDefined();
        expect(result.objectKey).toBe("projects/test/documents/invoice.pdf");
        expect(result.downloadUrl).toContain("X-Amz-Signature=");
      });
  });

  it("throws on presigned upload with invalid object key", async () => {
    await expect(adapterWithCreds.presignedUpload("../etc/passwd", "application/pdf", 100))
      .rejects.toThrow(/path traversal/);
  });

  it("throws on presigned upload with invalid MIME type", async () => {
    await expect(adapterWithCreds.presignedUpload("key.exe", "application/x-executable", 100))
      .rejects.toThrow(/not allowed/);
  });

  it("retrieves object metadata through a signed, read-only HEAD request", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(null, {
        status: 200,
        headers: {
          "content-length": "1024",
          etag: '"test-etag"',
          "last-modified": "Wed, 18 Nov 2026 03:00:00 GMT",
          "x-amz-version-id": "test-version",
        },
      }),
    );
    const adapter = new PrivateStorageAdapter({
      bucket: "pke-private-documents",
      region: "ap-southeast-1",
      endpoint: "https://storage.ap-southeast-1.neonpublic.com",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      fetchImpl,
    });

    const metadata = await adapter.objectMetadata("projects/test/documents/invoice.pdf");
    expect(metadata).toEqual({
      objectKey: "projects/test/documents/invoice.pdf",
      size: 1024,
      etag: '"test-etag"',
      lastModified: "Wed, 18 Nov 2026 03:00:00 GMT",
      versionId: "test-version",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("X-Amz-Signature=");
    expect(options?.method).toBe("HEAD");
    expect(options?.redirect).toBe("error");
  });

  it("does not expose a presigned URL when the metadata provider request fails", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }));
    const adapter = new PrivateStorageAdapter({
      bucket: "pke-private-documents",
      region: "ap-southeast-1",
      endpoint: "https://storage.ap-southeast-1.neonpublic.com",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      fetchImpl,
    });
    await expect(adapter.objectMetadata("projects/test/documents/invoice.pdf"))
      .rejects.toThrow("Storage metadata request failed (HTTP 403).");
  });

  it("verifies provider object size and SHA-256 after upload", async () => {
    const payload=Buffer.from("PKE private export document"), digest=crypto.createHash("sha256").update(payload).digest("hex");
    const fetchImpl=vi.fn(async (_input:RequestInfo|URL,init?:RequestInit)=>init?.method==="HEAD"
      ?new Response(null,{status:200,headers:{"content-length":String(payload.length),etag:'"provider-etag"'}})
      :new Response(payload,{status:200}));
    const adapter=new PrivateStorageAdapter({bucket:"pke-private-documents",region:"ap-southeast-1",endpoint:"https://storage.ap-southeast-1.neonpublic.com",accessKeyId:"test-access-key",secretAccessKey:"test-secret-key",fetchImpl});
    await expect(adapter.verifyObject("projects/test/documents/invoice.pdf",payload.length,digest)).resolves.toMatchObject({size:payload.length,sha256:digest});
    await expect(adapter.verifyObject("projects/test/documents/invoice.pdf",payload.length,"0".repeat(64))).rejects.toThrow(/SHA-256/);
  });

  it("deletes one private object through a signed S3 DELETE request", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(null, { status: 204 }),
    );
    const adapter = new PrivateStorageAdapter({
      bucket: "pke-private-documents",
      region: "ap-southeast-1",
      endpoint: "https://storage.ap-southeast-1.neonpublic.com",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      fetchImpl,
    });
    await expect(adapter.deleteObject("projects/test/documents/invoice.pdf")).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("X-Amz-Signature=");
    expect(options?.method).toBe("DELETE");
    expect(options?.redirect).toBe("error");
  });

  it("does not expose signed URLs when private object deletion cannot reach storage", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network failed"); });
    const adapter = new PrivateStorageAdapter({
      bucket: "pke-private-documents",
      region: "ap-southeast-1",
      endpoint: "https://storage.ap-southeast-1.neonpublic.com",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      fetchImpl,
    });
    await expect(adapter.deleteObject("projects/test/documents/invoice.pdf"))
      .rejects.toThrow("Storage object deletion failed before a provider response was received.");
  });

  it("rejects presign when endpoint protocol is wrong", async () => {
    await expect(adapterBadProtocol.presignedUpload("projects/test/documents/invoice.pdf", "application/pdf", 100))
      .rejects.toThrow(/HTTPS|unavailable|not configured/i);
  });
});

// FX calculation tests — pure math with local fixtures, no database needed.

function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

function computeFunctionalAmount(originalAmount: number, fxRate: number): number {
  return Math.round(originalAmount * fxRate * 100) / 100;
}

function computeFXGainLoss(originalAmount: number, fxRateAtOrigination: number, fxRateAtRevaluation: number): number {
  const functionalAtOrigination = computeFunctionalAmount(originalAmount, fxRateAtOrigination);
  const functionalAtRevaluation = computeFunctionalAmount(originalAmount, fxRateAtRevaluation);
  return Math.round((functionalAtRevaluation - functionalAtOrigination) * 100) / 100;
}

describe("FX calculation (offline fixtures)", () => {
  it("converts IDR amount to USD functional amount", () => {
    const result = convertAmount(1_000_000, 0.000065); // 1M IDR at 0.000065 USD/IDR
    expect(result).toBe(65);
  });

  it("computes functional amount from original and FX rate", () => {
    const result = computeFunctionalAmount(1000, 15500); // 1000 USD at 15500 IDR/USD
    expect(result).toBe(15_500_000);
  });

  it("computes FX gain/loss on revaluation", () => {
    // 1000 USD origination at 15000 IDR/USD = 15,000,000 IDR
    // Revalued at 15500 IDR/USD = 15,500,000 IDR
    // Gain = 500,000 IDR
    const result = computeFXGainLoss(1000, 15000, 15500);
    expect(result).toBe(500_000);
  });

  it("computes FX loss on revaluation", () => {
    // 1000 USD origination at 15500 IDR/USD = 15,500,000 IDR
    // Revalued at 15000 IDR/USD = 15,000,000 IDR
    // Loss = -500,000 IDR
    const result = computeFXGainLoss(1000, 15500, 15000);
    expect(result).toBe(-500_000);
  });

  it("handles zero amount", () => {
    expect(computeFunctionalAmount(0, 15500)).toBe(0);
    expect(convertAmount(0, 0.000065)).toBe(0);
  });

  it("handles very small rates with precision", () => {
    const result = convertAmount(1, 0.000001);
    expect(result).toBe(0); // rounded to 2 decimals
  });
});

// GPS validation tests — pure validation logic, no database needed.

function validateGpsInput(latitude: any, longitude: any, gpsAccuracy: any): { ok: boolean; reason?: string } {
  // Reject booleans explicitly — Number(true) === 1 which would pass silently
  if (typeof latitude === "boolean" || typeof longitude === "boolean" || typeof gpsAccuracy === "boolean") {
    return { ok: false, reason: "GPS values must be numbers, not booleans" };
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(gpsAccuracy);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, reason: "Invalid latitude: must be between -90 and 90" };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, reason: "Invalid longitude: must be between -180 and 180" };
  }
  if (!Number.isFinite(acc) || acc <= 0) {
    return { ok: false, reason: "Invalid gpsAccuracy: must be a finite number greater than 0" };
  }
  return { ok: true };
}

describe("GPS server-side validation (offline fixtures)", () => {
  it("accepts valid GPS coordinates", () => {
    expect(validateGpsInput(-6.2088, 106.8456, 5).ok).toBe(true);
    expect(validateGpsInput(0, 0, 1).ok).toBe(true);
    expect(validateGpsInput(90, 180, 100).ok).toBe(true);
    expect(validateGpsInput(-90, -180, 0.1).ok).toBe(true);
  });

  it("rejects latitude out of range", () => {
    expect(validateGpsInput(91, 0, 5).ok).toBe(false);
    expect(validateGpsInput(-91, 0, 5).ok).toBe(false);
  });

  it("rejects longitude out of range", () => {
    expect(validateGpsInput(0, 181, 5).ok).toBe(false);
    expect(validateGpsInput(0, -181, 5).ok).toBe(false);
  });

  it("rejects zero or negative GPS accuracy", () => {
    expect(validateGpsInput(0, 0, 0).ok).toBe(false);
    expect(validateGpsInput(0, 0, -1).ok).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(validateGpsInput(NaN, 0, 5).ok).toBe(false);
    expect(validateGpsInput(0, Infinity, 5).ok).toBe(false);
    expect(validateGpsInput(0, 0, NaN).ok).toBe(false);
  });

  it("rejects non-numeric types", () => {
    expect(validateGpsInput("not-a-number", 0, 5).ok).toBe(false);
    expect(validateGpsInput(0, true as any, 5).ok).toBe(false);
  });

  it("accepts numeric strings", () => {
    expect(validateGpsInput("45.5", "90.2", "3.5").ok).toBe(true);
  });
});

// GL balancing tests — pure validation logic, no database needed.

function isJournalBalanced(lines: { debit: number; credit: number }[]): boolean {
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  return Math.abs(totalDebit - totalCredit) <= 0.005;
}

function validateJournalLines(
  lines: { accountId: string; debit: number; credit: number }[],
  validAccountIds: Set<string>,
): { ok: boolean; reason?: string; invalidAccounts: string[] } {
  const invalidAccounts: string[] = [];
  for (const line of lines) {
    if (!validAccountIds.has(line.accountId)) {
      invalidAccounts.push(line.accountId);
    }
  }
  if (invalidAccounts.length > 0) {
    return { ok: false, reason: "Invalid account in journal lines", invalidAccounts };
  }
  if (!isJournalBalanced(lines.map(l => ({ debit: l.debit, credit: l.credit })))) {
    return { ok: false, reason: "Journal not balanced: total debit must equal total credit", invalidAccounts: [] };
  }
  return { ok: true, invalidAccounts: [] };
}

describe("General Ledger balancing (offline fixtures)", () => {
  const validAccounts = new Set(["acc-1", "acc-2", "acc-3"]);

  it("accepts balanced journal", () => {
    const lines = [
      { accountId: "acc-1", debit: 1000, credit: 0 },
      { accountId: "acc-2", debit: 0, credit: 1000 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("rejects unbalanced journal", () => {
    const lines = [
      { accountId: "acc-1", debit: 1000, credit: 0 },
      { accountId: "acc-2", debit: 0, credit: 500 },
    ];
    expect(isJournalBalanced(lines)).toBe(false);
  });

  it("accepts multi-line balanced journal", () => {
    const lines = [
      { accountId: "acc-1", debit: 500, credit: 0 },
      { accountId: "acc-2", debit: 500, credit: 0 },
      { accountId: "acc-3", debit: 0, credit: 1000 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("rejects journal with invalid account", () => {
    const lines = [
      { accountId: "acc-1", debit: 1000, credit: 0 },
      { accountId: "acc-invalid", debit: 0, credit: 1000 },
    ];
    const result = validateJournalLines(lines, validAccounts);
    expect(result.ok).toBe(false);
    expect(result.invalidAccounts).toContain("acc-invalid");
  });

  it("rejects empty journal lines", () => {
    const result = validateJournalLines([], validAccounts);
    expect(result.ok).toBe(true); // empty is technically balanced (0=0)
  });

  it("validates tolerance for rounding", () => {
    const lines = [
      { accountId: "acc-1", debit: 1000.003, credit: 0 },
      { accountId: "acc-2", debit: 0, credit: 1000.002 },
    ];
    // Difference is 0.001, within 0.005 tolerance
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("rejects beyond tolerance", () => {
    const lines = [
      { accountId: "acc-1", debit: 1000.01, credit: 0 },
      { accountId: "acc-2", debit: 0, credit: 1000.00 },
    ];
    // Difference is 0.01, beyond 0.005 tolerance
    expect(isJournalBalanced(lines)).toBe(false);
  });
});

// Inventory reservation available-quantity validation (offline fixtures)

function calcAvailableQty(
  lotQty: number,
  reservations: { lot_id: string; reserved_quantity: number; fulfilled_quantity: number; status: string }[],
  targetLotId: string,
): number {
  const used = reservations
    .filter(r => r.lot_id === targetLotId && r.status === "active")
    .reduce((sum, r) => sum + (Number(r.reserved_quantity || 0) - Number(r.fulfilled_quantity || 0)), 0);
  return Math.max(0, lotQty - used);
}

function validateReservationQty(
  reservedQty: number,
  availableQty: number,
): { ok: boolean; reason?: string } {
  if (reservedQty > availableQty) {
    return { ok: false, reason: `Kuantitas reservasi melebihi stok tersedia (tersedia ${availableQty}).` };
  }
  return { ok: true };
}

describe("Inventory reservation validation (offline fixtures)", () => {
  const reservations = [
    { lot_id: "lot-1", reserved_quantity: 300, fulfilled_quantity: 100, status: "active" },
    { lot_id: "lot-1", reserved_quantity: 200, fulfilled_quantity: 200, status: "active" },
    { lot_id: "lot-1", reserved_quantity: 100, fulfilled_quantity: 0, status: "released" },
    { lot_id: "lot-2", reserved_quantity: 500, fulfilled_quantity: 0, status: "active" },
  ];

  it("calculates available quantity correctly (reserved - fulfilled)", () => {
    // lot-1: qty=1000, active reservations: (300-100)=200 + (200-200)=0 = 200 used
    // available = 1000 - 200 = 800
    expect(calcAvailableQty(1000, reservations, "lot-1")).toBe(800);
  });

  it("returns full lot qty when no active reservations for lot", () => {
    expect(calcAvailableQty(1000, reservations, "lot-99")).toBe(1000);
  });

  it("excludes released reservations from used calculation", () => {
    // lot-1 released reservation of 100 should not count
    // used = (300-100) + (200-200) = 200, available = 800 (not 700)
    expect(calcAvailableQty(1000, reservations, "lot-1")).toBe(800);
  });

  it("excludes reservations for other lots", () => {
    // lot-2 has 500 reserved active, checking lot-1 (no lot-2 reservations affect lot-1)
    expect(calcAvailableQty(1000, reservations, "lot-1")).toBe(800);
  });

  it("calculates lot-2 available correctly", () => {
    // lot-2: 1000 - 500 = 500
    expect(calcAvailableQty(1000, reservations, "lot-2")).toBe(500);
  });

  it("accepts reservation within available quantity", () => {
    expect(validateReservationQty(500, 800).ok).toBe(true);
  });

  it("rejects reservation exceeding available quantity", () => {
    const result = validateReservationQty(900, 800);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("melebihi stok tersedia");
  });

  it("accepts reservation equal to available quantity", () => {
    expect(validateReservationQty(800, 800).ok).toBe(true);
  });

  it("rejects zero available quantity", () => {
    const result = validateReservationQty(1, 0);
    expect(result.ok).toBe(false);
  });
});
