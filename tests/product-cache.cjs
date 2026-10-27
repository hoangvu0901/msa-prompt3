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
    cache: response.headers.get("X-Cache"),
    invalidation: response.headers.get("X-Cache-Invalidation"),
    body: await response.json(),
  };
}

async function main() {
  const login = await request("POST", "/api/auth/login", {
    username: credentials.BOOTSTRAP_ADMIN_USERNAME,
    password: credentials.BOOTSTRAP_ADMIN_PASSWORD,
  });

  assert.equal(login.status, 200);
  const token = login.body.accessToken;

  const input = {
    pname: "Cache test " + randomUUID().slice(0, 8),
    price: 100000,
    quantity: 10,
  };

  const created = await request(
    "POST", "/api/products", input, token
  );

  assert.equal(created.status, 201);
  assert.equal(created.invalidation, "OK");

  const endpoint = "/api/products/" + created.body.pid;
  console.log("PASS: Create invalidates product cache.");

  const first = await request("GET", endpoint, undefined, token);
  assert.equal(first.status, 200);
  assert.equal(first.cache, "MISS");
  console.log("PASS: First detail request is MISS.");

  const second = await request("GET", endpoint, undefined, token);
  assert.equal(second.status, 200);
  assert.equal(second.cache, "HIT");
  assert.deepEqual(second.body, first.body);
  console.log("PASS: Second detail request is HIT.");

  const unauthenticated = await request("GET", endpoint);
  assert.equal(unauthenticated.status, 401);
  console.log("PASS: Cached product still requires JWT.");

  const listEndpoint = "/api/products?page=1&pageSize=20";

  const listFirst = await request(
    "GET", listEndpoint, undefined, token
  );
  assert.equal(listFirst.status, 200);
  assert.equal(listFirst.cache, "MISS");

  const listSecond = await request(
    "GET", listEndpoint, undefined, token
  );
  assert.equal(listSecond.status, 200);
  assert.equal(listSecond.cache, "HIT");
  assert.deepEqual(listSecond.body, listFirst.body);
  console.log("PASS: Product list changes from MISS to HIT.");

  const updated = await request(
    "PUT",
    endpoint,
    { ...input, price: 200000, quantity: 5 },
    token
  );

  assert.equal(updated.status, 200);
  assert.equal(updated.invalidation, "OK");

  const afterUpdate = await request(
    "GET", endpoint, undefined, token
  );

  assert.equal(afterUpdate.status, 200);
  assert.equal(afterUpdate.cache, "MISS");
  assert.equal(afterUpdate.body.price, 200000);
  assert.equal(afterUpdate.body.quantity, 5);
  console.log("PASS: Update invalidates detail cache and returns new data.");

  const listAfterUpdate = await request(
    "GET", listEndpoint, undefined, token
  );
  assert.equal(listAfterUpdate.status, 200);
  assert.equal(listAfterUpdate.cache, "MISS");
  console.log("PASS: Update invalidates list cache.");

  const warmed = await request("GET", endpoint, undefined, token);
  assert.equal(warmed.cache, "HIT");

  const deleted = await request(
    "DELETE", endpoint, undefined, token
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.invalidation, "OK");

  const afterDelete = await request(
    "GET", endpoint, undefined, token
  );
  assert.equal(afterDelete.status, 404);
  console.log("PASS: Delete does not return cached product.");

  console.log("ALL PRODUCT CACHE CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
