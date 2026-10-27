const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const pool = require("./infrastructure/database");
const { grpc, auth } = require("./infrastructure/grpc-contract");

const client = new auth.AuthService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50051"),
  grpc.credentials.createInsecure()
);

function register(input) {
  return new Promise((resolve, reject) => {
    client.register(
      input,
      { deadline: Date.now() + 10000 },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

async function expectError(label, input, expectedCode) {
  await assert.rejects(
    () => register(input),
    (error) => error.code === expectedCode
  );
  console.log("PASS:", label);
}

async function main() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);

  const input = {
    username: "demo_" + suffix,
    password: "DemoPass123!",
    email: "demo_" + suffix + "@example.com",
    phone: "0900000000",
  };

  try {
    const response = await register(input);
    assert.ok(response.uid > 0);
    console.log("PASS: Register valid account. uid =", response.uid);

    await expectError(
      "Duplicate username",
      { ...input, email: "other_" + suffix + "@example.com" },
      grpc.status.ALREADY_EXISTS
    );

    await expectError(
      "Duplicate email",
      { ...input, username: "other_" + suffix },
      grpc.status.ALREADY_EXISTS
    );

    await expectError(
      "Missing password",
      { ...input, password: "" },
      grpc.status.INVALID_ARGUMENT
    );

    const result = await pool.query(
      `SELECT u.password, r.rolename
       FROM users u
       JOIN roles r ON r.roleid = u.roleid
       WHERE u.uid = $1`,
      [response.uid]
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].rolename, "CUSTOMER");
    assert.notEqual(result.rows[0].password, input.password);
    assert.equal(
      await bcrypt.compare(input.password, result.rows[0].password),
      true
    );

    console.log("PASS: CUSTOMER role and bcrypt password.");
    console.log("ALL REGISTER CHECKS PASSED");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    client.close();
    await pool.end();
  }
}

main();
