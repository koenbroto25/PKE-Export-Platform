// Test Neon Auth JWKS accessibility - simple fetch
const jwksUrl = "https://ep-odd-resonance-b3zb42fw.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json";

fetch(jwksUrl)
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(data => {
    console.log("JWKS fetched successfully, keys:", data.keys ? data.keys.length : 0);
  })
  .catch(err => {
    console.error("JWKS fetch error:", err.message);
  });