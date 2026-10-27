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
  const username = "buyer_" + suffix;
  const password = "DemoPass123!";

  const registered = await request("POST", "/api/auth/register", {
    username,
    password,
    email: username + "@example.com",
  });
  assert.equal(registered.status, 201);

  const customerLogin = await request("POST", "/api/auth/login", {
    username,
    password,
  });
  assert.equal(customerLogin.status, 200);
  const customerToken = customerLogin.body.accessToken;

  const input = {
    pname: "San pham REST " + suffix,
    price: 199000.50,
    quantity: 10,
  };

  const missing = await request("GET", "/api/products");
  assert.equal(missing.status, 401);
  console.log("PASS: Product list requires JWT.");

  const denied = await request(
    "POST", "/api/products", input, customerToken
  );
  assert.equal(denied.status, 403);
  console.log("PASS: Customer cannot create products.");

  const created = await request(
    "POST", "/api/products", input, adminToken
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.price, input.price);
  const pid = created.body.pid;
  assert.ok(pid > 0);
  console.log("PASS: Admin creates product.");

  const list = await request(
    "GET", "/api/products?page=1&pageSize=20", undefined, customerToken
  );
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.items));
  console.log("PASS: Customer can view product list.");

  const fetched = await request(
    "GET", "/api/products/" + pid, undefined, customerToken
  );
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.pname, input.pname);
  assert.equal(fetched.body.price, input.price);
  console.log("PASS: Customer can view product details.");

  const replacement = {
    pname: "San pham da sua",
    price: 250000,
    quantity: 7,
  };

  const deniedUpdate = await request(
    "PUT", "/api/products/" + pid, replacement, customerToken
  );
  assert.equal(deniedUpdate.status, 403);
  console.log("PASS: Customer cannot update products.");

  const updated = await request(
    "PUT", "/api/products/" + pid, replacement, adminToken
  );
  assert.equal(updated.status, 200);

  const afterUpdate = await request(
    "GET", "/api/products/" + pid, undefined, customerToken
  );
  assert.equal(afterUpdate.status, 200);
  assert.equal(afterUpdate.body.price, replacement.price);
  assert.equal(afterUpdate.body.quantity, replacement.quantity);
  console.log("PASS: Admin update is persisted.");

  const invalid = await request(
    "POST",
    "/api/products",
    { ...input, quantity: -1 },
    adminToken
  );
  assert.equal(invalid.status, 400);
  console.log("PASS: Invalid quantity returns 400.");

  const deniedDelete = await request(
    "DELETE", "/api/products/" + pid, undefined, customerToken
  );
  assert.equal(deniedDelete.status, 403);
  console.log("PASS: Customer cannot delete products.");

  const deleted = await request(
    "DELETE", "/api/products/" + pid, undefined, adminToken
  );
  assert.equal(deleted.status, 200);

  const afterDelete = await request(
    "GET", "/api/products/" + pid, undefined, customerToken
  );
  assert.equal(afterDelete.status, 404);
  console.log("PASS: Admin deletion returns subsequent 404.");

  console.log("ALL PRODUCT REST CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
