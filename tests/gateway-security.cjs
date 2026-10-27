const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const base = "http://127.0.0.1:3002";

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

function post(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(path, token) {
  return request(path, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
}

async function main() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const username = "security_" + suffix;
  const password = "DemoPass123!";

  const registered = await post("/api/auth/register", {
    username,
    password,
    email: username + "@example.com",
  });
  assert.equal(registered.status, 201);

  const login = await post("/api/auth/login", {
    username,
    password,
  });
  assert.equal(login.status, 200);
  const token = login.body.accessToken;
  assert.ok(token);

  const missing = await get("/api/auth/me");
  assert.equal(missing.status, 401);
  console.log("PASS: Missing token returns 401.");

  const invalid = await get("/api/auth/me", "invalid-token");
  assert.equal(invalid.status, 401);
  console.log("PASS: Invalid token returns 401.");

  const me = await get("/api/auth/me", token);
  assert.equal(me.status, 200);
  assert.equal(me.body.uid, String(registered.body.uid));
  assert.equal(me.body.role, "CUSTOMER");
  console.log("PASS: Valid token returns correct identity.");

  const forbidden = await get("/api/admin/health", token);
  assert.equal(forbidden.status, 403);
  console.log("PASS: CUSTOMER cannot access ADMIN route.");

  const parts = token.split(".");
  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8")
  );

  payload.role = "ADMIN";
  parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const forged = await get("/api/admin/health", parts.join("."));
  assert.equal(forged.status, 401);
  console.log("PASS: Forged ADMIN token returns 401.");

  console.log("ALL GATEWAY SECURITY CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
