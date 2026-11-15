// Test Neon Auth JWKS accessibility using http module
import http from "http";

const jwksUrl = new URL("https://ep-odd-resonance-b3zb42fw.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json");

const options = {
  hostname: jwksUrl.hostname,
  path: jwksUrl.pathname + jwksUrl.search,
  method: "GET",
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Content-Type: ${res.headers["content-type"]}`);
    try {
      const parsed = JSON.parse(data);
      console.log(`JWKS keys: ${parsed.keys ? parsed.keys.length : 0}`);
      console.log("JWKS is accessible!");
    } catch (e) {
      console.log("Not valid JSON, but endpoint is reachable");
    }
  });
});

req.on("error", (e) => {
  console.error("Error:", e.message);
});

req.end();