const jwt = require("jsonwebtoken");
const { grpc } = require("./auth-client");
const { callCustomer } = require("./customer-client");

async function ensureCustomer(uid) {
  try {
    if (!Number.isInteger(uid) || uid <= 0 || uid > 2147483647) {
      throw new Error("Invalid account identifier");
    }

    return await callCustomer("createCustomer", {
      uid,
      fullname: "",
    });
  } catch (cause) {
    console.error("Customer provisioning failed:", cause.message);

    const error = new Error("Customer profile unavailable");
    error.code = grpc.status.UNAVAILABLE;
    throw error;
  }
}

async function ensureCustomerFromLogin(accessToken) {
  const claims = jwt.verify(accessToken, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: "msa-prompt3-auth",
    audience: "msa-prompt3-api",
  });

  if (claims.role === "CUSTOMER") {
    await ensureCustomer(Number(claims.sub));
  }
}

module.exports = { ensureCustomer, ensureCustomerFromLogin };
