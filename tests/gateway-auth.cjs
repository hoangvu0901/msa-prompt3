const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const base = "http://127.0.0.1:3002";

async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function main() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const account = {
    username: "rest_" + suffix,
    password: "DemoPass123!",
    email: "rest_" + suffix + "@example.com",
    phone: "0900000000",
  };

  const created = await post("/api/auth/register", account);
  assert.equal(created.status, 201);
  assert.ok(created.body.uid > 0);
  console.log("PASS: REST register returns 201.");

  const duplicate = await post("/api/auth/register", account);
  assert.equal(duplicate.status, 409);
  console.log("PASS: Duplicate account returns 409.");

  const login = await post("/api/auth/login", {
    username: account.username,
    password: account.password,
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.accessToken);
  assert.equal(login.body.tokenType, "Bearer");
  assert.equal(login.body.expiresIn, 3600);
  console.log("PASS: REST login returns JWT.");

  const wrong = await post("/api/auth/login", {
    username: account.username,
    password: "WrongPass123!",
  });
  assert.equal(wrong.status, 401);
  console.log("PASS: Wrong password returns 401.");

  const missing = await post("/api/auth/login", {
    username: account.username,
  });
  assert.equal(missing.status, 400);
  console.log("PASS: Missing password returns 400.");

  const invalidType = await post("/api/auth/login", {
    username: account.username,
    password: 123456,
  });
  assert.equal(invalidType.status, 400);
  console.log("PASS: Invalid field type returns 400.");

  console.log("ALL GATEWAY AUTH CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
