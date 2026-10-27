const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { grpc, auth } = require("./infrastructure/grpc-contract");

const client = new auth.AuthService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50051"),
  grpc.credentials.createInsecure()
);

function rpc(method, input) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + 10000 },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

async function expectError(label, input, code) {
  await assert.rejects(
    () => rpc("login", input),
    (error) => error.code === code
  );
  console.log("PASS:", label);
}

async function main() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const username = "login_" + suffix;
  const password = "DemoPass123!";

  try {
    const registered = await rpc("register", {
      username,
      password,
      email: username + "@example.com",
      phone: "0900000000",
    });

    const response = await rpc("login", { username, password });

    assert.equal(response.tokenType, "Bearer");
    assert.equal(response.expiresIn, 3600);
    assert.ok(response.accessToken);
    console.log("PASS: Login returns access token.");

    const options = {
      algorithms: ["HS256"],
      issuer: "msa-prompt3-auth",
      audience: "msa-prompt3-api",
    };

    const claims = jwt.verify(
      response.accessToken,
      process.env.JWT_SECRET,
      options
    );

    assert.equal(claims.sub, String(registered.uid));
    assert.equal(claims.role, "CUSTOMER");
    assert.equal(claims.exp - claims.iat, 3600);
    console.log("PASS: JWT signature, subject, role and expiration.");

    await expectError(
      "Wrong password",
      { username, password: "WrongPass123!" },
      grpc.status.UNAUTHENTICATED
    );

    await expectError(
      "Unknown username",
      { username: "missing_" + suffix, password },
      grpc.status.UNAUTHENTICATED
    );

    await expectError(
      "Missing password",
      { username, password: "" },
      grpc.status.INVALID_ARGUMENT
    );

    const parts = response.accessToken.split(".");
    const forgedPayload = {
      ...JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
      role: "ADMIN",
    };
    parts[1] = Buffer.from(
      JSON.stringify(forgedPayload)
    ).toString("base64url");

    assert.throws(
      () => jwt.verify(parts.join("."), process.env.JWT_SECRET, options),
      (error) => error.name === "JsonWebTokenError"
    );
    console.log("PASS: Modified token rejected.");

    assert.throws(
      () => jwt.verify(response.accessToken, process.env.JWT_SECRET, {
        ...options,
        clockTimestamp: claims.exp + 1,
      }),
      (error) => error.name === "TokenExpiredError"
    );
    console.log("PASS: Expired token rejected.");

    console.log("ALL LOGIN CHECKS PASSED");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

main();
