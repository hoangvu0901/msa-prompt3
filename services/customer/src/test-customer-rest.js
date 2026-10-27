const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  grpc,
  loadContract,
} = require("./infrastructure/grpc-contract");

const auth = loadContract("auth.proto", "auth");
const authClient = new auth.AuthService(
  "auth-service:50051",
  grpc.credentials.createInsecure()
);

const base = "http://api-gateway:3002";

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    signal: AbortSignal.timeout(20000),
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

function registerDirect(input) {
  return new Promise((resolve, reject) => {
    authClient.register(
      input,
      { deadline: Date.now() + 10000 },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

async function main() {
  try {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const account = {
      username: "profile_" + suffix,
      password: "DemoPass123!",
      email: "profile_" + suffix + "@example.com",
    };

    const registered = await post("/api/auth/register", account);
    assert.equal(registered.status, 201);

    const login = await post("/api/auth/login", {
      username: account.username,
      password: account.password,
    });
    assert.equal(login.status, 200);

    const uid = registered.body.uid;
    const token = login.body.accessToken;

    const own = await get("/api/customers/" + uid, token);
    assert.equal(own.status, 200);
    assert.equal(own.body.uid, uid);
    assert.equal(own.body.mname, "STANDARD");
    assert.equal(own.body.score, 0);
    console.log("PASS: Own customer profile and membership accessible.");

    const missing = await get("/api/customers/" + uid);
    assert.equal(missing.status, 401);
    console.log("PASS: Missing JWT returns 401.");

    const invalid = await get("/api/customers/abc", token);
    assert.equal(invalid.status, 400);
    console.log("PASS: Invalid uid returns 400.");

    const legacy = {
      username: "legacy_" + suffix,
      password: "DemoPass123!",
      email: "legacy_" + suffix + "@example.com",
    };

    const legacyUser = await registerDirect(legacy);

    const other = await get(
      "/api/customers/" + legacyUser.uid,
      token
    );
    assert.equal(other.status, 403);
    console.log("PASS: Access to another customer returns 403.");

    const legacyLogin = await post("/api/auth/login", {
      username: legacy.username,
      password: legacy.password,
    });
    assert.equal(legacyLogin.status, 200);

    const recovered = await get(
      "/api/customers/" + legacyUser.uid,
      legacyLogin.body.accessToken
    );
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.uid, legacyUser.uid);
    assert.equal(recovered.body.mname, "STANDARD");
    console.log("PASS: Login creates missing customer profile.");

    console.log("ALL CUSTOMER REST CHECKS PASSED");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    authClient.close();
  }
}

main();
