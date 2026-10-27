const assert = require("node:assert/strict");

const base = "http://127.0.0.1:3002";

async function main() {
  let limited = false;

  for (let i = 1; i <= 45; i++) {
    const response = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });

    const body = await response.json();

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));

      assert.ok(retryAfter >= 1 && retryAfter <= 60);
      assert.equal(body.message, "Too many requests");

      console.log("PASS: Excess requests return 429.");
      console.log("PASS: Retry-After =", retryAfter, "seconds.");
      limited = true;
      break;
    }

    assert.equal(response.status, 400);
  }

  assert.equal(limited, true, "Rate limit was not triggered");

  const health = await fetch(base + "/api/health", {
    signal: AbortSignal.timeout(10000),
  });

  const healthBody = await health.json();

  assert.equal(health.status, 200);
  assert.equal(healthBody.services.redis, "UP");

  console.log("PASS: Health endpoint remains available.");
  console.log("ALL RATE LIMIT CHECKS PASSED");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
