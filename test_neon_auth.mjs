// Test Neon Auth JWKS accessibility
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksUrl = "https://ep-odd-resonance-b3zb42fw.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const baseUrl = "https://ep-odd-resonance-b3zb42fw.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";

console.log("Testing JWKS URL:", jwksUrl);
console.log("Testing Base URL:", baseUrl);

try {
  const jwksSet = createRemoteJWKSet(new URL(jwksUrl));
  console.log("JWKS set created successfully");
  
  // Try to fetch JWKS
  const jwks = await jwksSet.getKey("test");
  console.log("JWKS key retrieved:", jwks);
} catch (error) {
  console.error("JWKS error:", error.message);
}

try {
  const base = new URL(baseUrl);
  console.log("Base URL origin:", base.origin);
} catch (error) {
  console.error("Base URL error:", error.message);
}