const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const base = "http://127.0.0.1:3002";

const credentials = {};

for (const line of fs.readFileSync(
  path.join(root, ".env.admin.local"),
  "utf8"
).split(/\r?\n/)) {
  const index = line.indexOf("=");

  if (index > 0) {
    credentials[line.slice(0, index)] = line.slice(index + 1);
  }
}

const silverMid = Number(
  fs.readFileSync(path.join(__dirname, "silver-mid.txt"), "utf8").trim()
);

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
  assert.ok(
    Number.isInteger(silverMid) && silverMid > 0,
    "Missing SILVER membership ID"
  );

  const adminLogin = await request("POST", "/api/auth/login", {
    username: credentials.BOOTSTRAP_ADMIN_USERNAME,
    password: credentials.BOOTSTRAP_ADMIN_PASSWORD,
  });

  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.accessToken;
  assert.ok(adminToken);
  console.log("PASS: Admin login succeeds.");

  const adminHealth = await request(
    "GET",
    "/api/admin/health",
    undefined,
    adminToken
  );

  assert.equal(adminHealth.status, 200);
  console.log("PASS: Real ADMIN can access ADMIN route.");

  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const account = {
    username: "member_" + suffix,
    password: "DemoPass123!",
    email: "member_" + suffix + "@example.com",
  };

  const registered = await request(
    "POST",
    "/api/auth/register",
    account
  );
  assert.equal(registered.status, 201);

  const customerLogin = await request("POST", "/api/auth/login", {
    username: account.username,
    password: account.password,
  });
  assert.equal(customerLogin.status, 200);

  const customerToken = customerLogin.body.accessToken;
  const endpoint = "/api/customers/" + registered.body.uid;

  const before = await request(
    "GET",
    endpoint,
    undefined,
    adminToken
  );
  assert.equal(before.status, 200);
  assert.equal(before.body.mname, "STANDARD");
  console.log("PASS: Admin can view customer profile.");

  const updated = await request(
    "PUT",
    endpoint,
    {
      fullname: "Khach hang SILVER",
      mid: silverMid,
    },
    adminToken
  );

  assert.equal(updated.status, 200);
  console.log("PASS: Admin can update name and membership.");

  const after = await request(
    "GET",
    endpoint,
    undefined,
    customerToken
  );

  assert.equal(after.status, 200);
  assert.equal(after.body.fullname, "Khach hang SILVER");
  assert.equal(after.body.mid, silverMid);
  assert.equal(after.body.mname, "SILVER");
  assert.equal(after.body.score, 100);
  console.log("PASS: Customer sees SILVER membership and score 100.");

  const forbidden = await request(
    "PUT",
    endpoint,
    { mid: before.body.mid },
    customerToken
  );

  assert.equal(forbidden.status, 403);
  console.log("PASS: Customer still cannot change membership.");

  const loginAgain = await request("POST", "/api/auth/login", {
    username: account.username,
    password: account.password,
  });

  assert.equal(loginAgain.status, 200);

  const preserved = await request(
    "GET",
    endpoint,
    undefined,
    loginAgain.body.accessToken
  );

  assert.equal(preserved.status, 200);
  assert.equal(preserved.body.mid, silverMid);
  assert.equal(preserved.body.fullname, "Khach hang SILVER");
  console.log("PASS: Login preserves membership and fullname.");

  console.log("ALL ADMIN MEMBERSHIP CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
