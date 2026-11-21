// Private object storage adapter for bucket `pke-private-documents`.
// Storage remains private; credentials live server-side only. No secret is ever
// sent to the browser. Implements AWS S3 Signature Version 4 presigned URL
// generation using Node.js crypto (no external AWS SDK dependency).

import crypto from "node:crypto";

export type StorageConfig = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  fetchImpl?: typeof fetch;
};

export type StorageStatus = {
  available: boolean;
  bucket: string;
  reason?: string;
};

export type PresignedUpload = {
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
  requiredHeaders: Record<string, string>;
  notes?: string;
};

export type PresignedDownload = {
  downloadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
};

export type StorageError = {
  code: string;
  message: string;
};

// Allowed MIME types for document uploads.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/zip",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".webp",
  ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".zip",
]);

const MAX_CONTENT_LENGTH = 50 * 1024 * 1024; // 50 MB (pre-sign validation only; provider/object enforcement is not claimed here)

export class PrivateStorageAdapter {
  private readonly config: StorageConfig;
  private readonly available: boolean;
  private readonly reason: string | undefined;
  private readonly endpointUrl?: URL;
  private readonly signingHost?: string;
  private readonly signingOrigin?: string;
  private readonly region: string;
  private readonly forcePathStyle: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(config: StorageConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.region = config.region || "ap-southeast-1";
    this.forcePathStyle = config.forcePathStyle !== false; // default path-style for Neon-compatible S3
    const configured =
      Boolean(config.accessKeyId && config.secretAccessKey && config.bucket) &&
      Boolean(config.endpoint || config.region);
    let reason = configured
      ? undefined
      : "Storage credentials not configured. Object upload/download is unavailable until server-side storage credentials are provided.";

    if (configured) {
      try {
        const endpoint = this.resolveEndpoint(config.endpoint, this.region);
        const parsed = new URL(endpoint);
        if (parsed.protocol !== "https:") {
          reason = "Storage endpoint must use HTTPS.";
        } else {
          this.endpointUrl = parsed;
          // SigV4 Host header is host[:port] (no scheme, no path)
          this.signingHost = parsed.host;
          this.signingOrigin = parsed.origin;
        }
      } catch {
        reason = "Storage endpoint is invalid.";
      }
    }

    // No silent fallback to public AWS S3 when an explicit endpoint is not configured for Neon/object-storage use.
    // Region-only configuration is insufficient for a private Neon Object Storage target in this adapter.
    if (!reason && configured && !config.endpoint) {
      reason = "Storage endpoint is not configured (PKE_STORAGE_ENDPOINT/AWS_ENDPOINT_URL_S3 required). No fallback to public S3 is performed.";
    }

    this.available = configured && !reason;
    this.reason = reason;
  }

  status(): StorageStatus {
    return {
      available: this.available,
      bucket: this.config.bucket,
      reason: this.reason,
    };
  }

  // Validate object key follows project namespace and contains no traversal.
  validateObjectKey(objectKey: string): { ok: boolean; reason?: string } {
    if (!objectKey || typeof objectKey !== "string") {
      return { ok: false, reason: "Object key is required." };
    }
    if (objectKey.includes("..")) {
      return { ok: false, reason: "Object key must not contain path traversal." };
    }
    if (objectKey.startsWith("/") || objectKey.startsWith("./")) {
      return { ok: false, reason: "Object key must not start with / or ./." };
    }
    if (objectKey.length > 1024) {
      return { ok: false, reason: "Object key too long." };
    }
    return { ok: true };
  }

  // Validate file metadata before issuing any presigned URL.
  // NOTE: contentLength is client-declared pre-sign metadata only; adapter does not claim provider/object enforcement.
  validateFileMetadata({
    mimeType,
    contentLength,
    filename,
  }: {
    mimeType?: string;
    contentLength?: number;
    filename?: string;
  }): { ok: boolean; reason?: string } {
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      return { ok: false, reason: `MIME type not allowed: ${mimeType}` };
    }
    if (contentLength !== undefined) {
      if (!Number.isFinite(contentLength) || contentLength <= 0) {
        return { ok: false, reason: "Content length must be greater than 0." };
      }
      if (contentLength > MAX_CONTENT_LENGTH) {
        return { ok: false, reason: `Content length exceeds ${MAX_CONTENT_LENGTH} bytes.` };
      }
    }
    if (filename) {
      const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return { ok: false, reason: `File extension not allowed: ${ext}` };
      }
    }
    return { ok: true };
  }

  private resolveEndpoint(endpoint: string | undefined, region: string): string {
    if (endpoint) return endpoint;
    // Not used for availability when endpoint missing (fail-closed), but kept for explicitness.
    return `https://s3.${region}.amazonaws.com`;
  }

  private hmac(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac("sha256", key).update(data).digest();
  }

  private sha256(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  private encodeRfc3986(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  private canonicalObjectPath(objectKey: string): string {
    // Encode each segment, preserve path separators
    return objectKey.split("/").map((s) => this.encodeRfc3986(s)).join("/");
  }

  // AWS Signature Version 4 signing key derivation.
  private getSigningKey(
    secretAccessKey: string,
    dateStamp: string,
    region: string,
    service: string,
  ): Buffer {
    const kDate = this.hmac(Buffer.from(`AWS4${secretAccessKey}`), dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    return this.hmac(kService, "aws4_request");
  }

  private buildPresignedUrl(
    method: "PUT" | "GET" | "HEAD" | "DELETE",
    objectKey: string,
    expiresInSeconds: number,
    mimeType?: string,
  ): { url: string; signedHeaders: string; requiredHeaders: Record<string, string> } {
    const accessKeyId = this.config.accessKeyId;
    const secretAccessKey = this.config.secretAccessKey;
    const bucket = this.config.bucket;
    const region = this.region;
    const endpointUrl = this.endpointUrl;
    const host = this.signingHost;
    const origin = this.signingOrigin;

    if (!this.available || !accessKeyId || !secretAccessKey || !endpointUrl || !host || !origin) {
      throw new Error(this.reason || "Storage credentials not configured.");
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const dateStamp = amzDate.substring(0, 8);
    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const expires = Math.max(1, Math.min(900, expiresInSeconds || 900));

    const encodedKeyPath = this.canonicalObjectPath(objectKey);
    const endpointBasePath = endpointUrl.pathname.replace(/\/+$/, ""); // may be "" or "/base"
    // SigV4 canonical URI must include leading slash and full path (endpoint base + bucket in path-style + key)
    const canonicalUri = this.forcePathStyle
      ? `${endpointBasePath || ""}/${this.encodeRfc3986(bucket)}/${encodedKeyPath}`.replace(/\/{2,}/g, "/").replace(/^([^/])/, "/$1")
      : `${endpointBasePath || ""}/${encodedKeyPath}`.replace(/\/{2,}/g, "/").replace(/^([^/])/, "/$1");

    // Signed headers: always host; bind content-type for PUT when provided (client must send same header)
    const headerPairs: Array<[string, string]> = [["host", host]];
    const requiredHeaders: Record<string, string> = {};
    if (method === "PUT" && mimeType) {
      headerPairs.push(["content-type", mimeType]);
      requiredHeaders["Content-Type"] = mimeType;
    }
    headerPairs.sort((a, b) => a[0].localeCompare(b[0]));
    const signedHeaders = headerPairs.map(([k]) => k).join(";");
    const canonicalHeaders = headerPairs.map(([k, v]) => `${k}:${String(v).trim()}\n`).join("");

    const qp: Array<[string, string]> = [
      ["X-Amz-Algorithm", algorithm],
      ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", String(expires)],
      ["X-Amz-SignedHeaders", signedHeaders],
    ];
    qp.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    const canonicalQuerystring = qp.map(([k, v]) => `${this.encodeRfc3986(k)}=${this.encodeRfc3986(v)}`).join("&");

    const canonicalRequest = [
      method,
      canonicalUri || "/",
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const hashedCanonicalRequest = this.sha256(canonicalRequest);
    const stringToSign = [algorithm, amzDate, credentialScope, hashedCanonicalRequest].join("\n");
    const signingKey = this.getSigningKey(secretAccessKey, dateStamp, region, "s3");
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    const presignedUrl = `${origin}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;

    return { url: presignedUrl, signedHeaders, requiredHeaders };
  }

  async presignedUpload(
    objectKey: string,
    mimeType: string,
    contentLength: number,
  ): Promise<PresignedUpload> {
    if (!this.available) {
      throw new Error(this.reason || "Storage unavailable");
    }
    const keyCheck = this.validateObjectKey(objectKey);
    if (!keyCheck.ok) {
      throw new Error(keyCheck.reason);
    }
    const metaCheck = this.validateFileMetadata({ mimeType, contentLength });
    if (!metaCheck.ok) {
      throw new Error(metaCheck.reason);
    }
    const { url, requiredHeaders } = this.buildPresignedUrl("PUT", objectKey, 900, mimeType);
    return {
      uploadUrl: url,
      objectKey,
      expiresInSeconds: 900,
      requiredHeaders,
      notes: "Client-declared contentLength is pre-sign validated only; provider/object size enforcement is not claimed by this adapter.",
    };
  }

  async presignedDownload(objectKey: string): Promise<PresignedDownload> {
    if (!this.available) {
      throw new Error(this.reason || "Storage unavailable");
    }
    const keyCheck = this.validateObjectKey(objectKey);
    if (!keyCheck.ok) {
      throw new Error(keyCheck.reason);
    }
    const { url } = this.buildPresignedUrl("GET", objectKey, 900);
    return { downloadUrl: url, objectKey, expiresInSeconds: 900 };
  }

  async objectMetadata(objectKey: string): Promise<{
    objectKey: string;
    size: number;
    etag?: string;
    lastModified?: string;
    versionId?: string;
  }> {
    if (!this.available) {
      throw new Error(this.reason || "Storage unavailable");
    }
    const keyCheck = this.validateObjectKey(objectKey);
    if (!keyCheck.ok) {
      throw new Error(keyCheck.reason);
    }
    const { url } = this.buildPresignedUrl("HEAD", objectKey, 60);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "HEAD",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Never include the presigned URL or provider credentials in an error.
      throw new Error("Storage metadata request failed before a provider response was received.");
    }

    if (response.status === 404 || response.status === 410) {
      throw new Error("Storage object was not found.");
    }
    if (!response.ok) {
      throw new Error(`Storage metadata request failed (HTTP ${response.status}).`);
    }

    const contentLength = response.headers.get("content-length");
    const size = contentLength === null ? Number.NaN : Number(contentLength);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("Storage provider returned an invalid object size.");
    }

    return {
      objectKey,
      size,
      etag: response.headers.get("etag") || undefined,
      lastModified: response.headers.get("last-modified") || undefined,
      versionId: response.headers.get("x-amz-version-id") || undefined,
    };
  }

  async verifyObject(objectKey: string, expectedSize: number, expectedSha256: string): Promise<{ objectKey: string; size: number; sha256: string; etag?: string }> {
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_CONTENT_LENGTH) throw new Error("Expected object size is invalid or exceeds the upload limit.");
    if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) throw new Error("Expected SHA-256 checksum must be a 64-character hexadecimal digest.");
    const metadata = await this.objectMetadata(objectKey);
    if (metadata.size !== expectedSize || metadata.size > MAX_CONTENT_LENGTH) throw new Error("Stored object size does not match the declared upload size.");
    const { url } = this.buildPresignedUrl("GET", objectKey, 900);
    let response: Response;
    try { response = await this.fetchImpl(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000) }); }
    catch { throw new Error("Storage checksum verification failed before a provider response was received."); }
    if (!response.ok || !response.body) throw new Error(`Storage checksum verification failed (HTTP ${response.status}).`);
    const reader=response.body.getReader(), hash=crypto.createHash("sha256"); let size=0;
    try { while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>expectedSize||size>MAX_CONTENT_LENGTH){await reader.cancel();throw new Error("Stored object size exceeds the declared upload size.");}hash.update(Buffer.from(chunk.value));} }
    finally { reader.releaseLock(); }
    const sha256=hash.digest("hex");
    if(size!==expectedSize)throw new Error("Stored object size does not match the declared upload size.");
    if(sha256.toLowerCase()!==expectedSha256.toLowerCase())throw new Error("Stored object SHA-256 does not match the declared checksum.");
    return {objectKey,size,sha256,etag:metadata.etag};
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (!this.available) {
      throw new Error(this.reason || "Storage unavailable");
    }
    const keyCheck = this.validateObjectKey(objectKey);
    if (!keyCheck.ok) {
      throw new Error(keyCheck.reason);
    }
    const { url } = this.buildPresignedUrl("DELETE", objectKey, 60);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "DELETE",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Never include the presigned URL or provider credentials in an error.
      throw new Error("Storage object deletion failed before a provider response was received.");
    }
    // S3 DELETE is idempotent; 404/410 are also considered clean.
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`Storage object deletion failed (HTTP ${response.status}).`);
    }
  }
}

const defaultBucket = process.env.PKE_PRIVATE_BUCKET || "pke-private-documents";

export const privateStorage = new PrivateStorageAdapter({
  bucket: defaultBucket,
  region: process.env.PKE_STORAGE_REGION || process.env.AWS_REGION || undefined,
  endpoint: process.env.PKE_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || undefined,
  accessKeyId: process.env.PKE_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || undefined,
  secretAccessKey: process.env.PKE_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || undefined,
  forcePathStyle: true,
});
