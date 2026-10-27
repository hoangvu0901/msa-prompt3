const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const base = "http://127.0.0.1:3002";
const credentials = {};

for (const line of fs.readFileSync(
  path.resolve(__dirname, "../.env.admin.local"),
  "utf8"
).split(/\r?\n/)) {
  const index = line.indexOf("=");
  if (index > 0) {
    credentials[line.slice(0, index)] = line.slice(index + 1);
  }
}

async function request(method, endpoint, body, token) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await fetch(base + endpoint, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function main() {
  const adminLogin = await request("POST", "/api/auth/login", {
    username: credentials.BOOTSTRAP_ADMIN_USERNAME,
    password: credentials.BOOTSTRAP_ADMIN_PASSWORD,
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.accessToken;

  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const username = "tier_" + suffix;
  const password = "DemoPass123!";

  const registered = await request("POST", "/api/auth/register", {
    username,
    password,
    email: username + "@example.com",
  });
  assert.equal(registered.status, 201);

  const login = await request("POST", "/api/auth/login", {
    username,
    password,
  });
  assert.equal(login.status, 200);
  const customerToken = login.body.accessToken;

  const noToken = await request("GET", "/api/memberships");
  assert.equal(noToken.status, 401);
  console.log("PASS: Membership list requires JWT.");

  const list = await request(
    "GET", "/api/memberships", undefined, customerToken
  );
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((item) => item.mname === "STANDARD"));
  console.log("PASS: Customer can view memberships.");

  const membership = {
    mname: "TEST_" + suffix.toUpperCase(),
    score: 100,
  };

  const denied = await request(
    "POST", "/api/memberships", membership, customerToken
  );
  assert.equal(denied.status, 403);
  console.log("PASS: Customer cannot create membership.");

  const created = await request(
    "POST", "/api/memberships", membership, adminToken
  );
  assert.equal(created.status, 201);
  const mid = created.body.mid;
  console.log("PASS: Admin creates membership.");

  const duplicate = await request(
    "POST", "/api/memberships", membership, adminToken
  );
  assert.equal(duplicate.status, 409);
  console.log("PASS: Duplicate membership returns 409.");

  const assigned = await request(
    "PUT",
    "/api/customers/" + registered.body.uid,
    { mid },
    adminToken
  );
  assert.equal(assigned.status, 200);

  const updated = await request(
    "PATCH", "/api/memberships/" + mid, { score: 250 }, adminToken
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.score, 250);
  console.log("PASS: Admin updates membership score.");

  const profile = await request(
    "GET",
    "/api/customers/" + registered.body.uid,
    undefined,
    customerToken
  );
  assert.equal(profile.status, 200);
  assert.equal(profile.body.mid, mid);
  assert.equal(profile.body.score, 250);
  console.log("PASS: Customer profile reflects updated membership score.");

  const deniedUpdate = await request(
    "PATCH", "/api/memberships/" + mid, { score: 999 }, customerToken
  );
  assert.equal(deniedUpdate.status, 403);
  console.log("PASS: Customer cannot change score.");

  const negative = await request(
    "PATCH", "/api/memberships/" + mid, { score: -1 }, adminToken
  );
  assert.equal(negative.status, 400);
  console.log("PASS: Negative score rejected.");

  console.log("ALL MEMBERSHIP API CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
