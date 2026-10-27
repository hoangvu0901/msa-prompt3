const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const base = "http://127.0.0.1:3002";

async function request(method, path, body, token) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await fetch(base + path, {
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
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const username = "update_" + suffix;
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

  const token = login.body.accessToken;
  const uid = registered.body.uid;
  const path = "/api/customers/" + uid;

  const updated = await request(
    "PUT",
    path,
    { fullname: "Nguyen Tan Hoang Vu" },
    token
  );

  assert.equal(updated.status, 200);
  assert.equal(updated.body.uid, uid);
  console.log("PASS: Update own fullname returns 200.");

  const fetched = await request("GET", path, undefined, token);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.fullname, "Nguyen Tan Hoang Vu");
  console.log("PASS: Updated fullname is persisted.");

  const escalation = await request(
    "PUT",
    path,
    { mid: fetched.body.mid },
    token
  );

  assert.equal(escalation.status, 403);
  console.log("PASS: CUSTOMER cannot change membership.");

  const other = await request(
    "PUT",
    "/api/customers/" + (uid + 1),
    { fullname: "Not allowed" },
    token
  );

  assert.equal(other.status, 403);
  console.log("PASS: Cannot update another customer.");

  const invalid = await request(
    "PUT",
    path,
    { fullname: "" },
    token
  );

  assert.equal(invalid.status, 400);
  console.log("PASS: Empty fullname returns 400.");

  const missing = await request(
    "PUT",
    path,
    { fullname: "No token" }
  );

  assert.equal(missing.status, 401);
  console.log("PASS: Missing JWT returns 401.");

  const loginAgain = await request("POST", "/api/auth/login", {
    username,
    password,
  });

  assert.equal(loginAgain.status, 200);

  const preserved = await request(
    "GET",
    path,
    undefined,
    loginAgain.body.accessToken
  );

  assert.equal(preserved.status, 200);
  assert.equal(preserved.body.fullname, "Nguyen Tan Hoang Vu");
  console.log("PASS: Login preserves updated customer profile.");

  console.log("ALL CUSTOMER UPDATE CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
