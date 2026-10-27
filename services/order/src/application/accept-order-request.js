const {
  normalizeOrderRequest,
} = require("../domain/order-request");
const {
  createOrGetPending,
} = require("../infrastructure/order-request-repository");

async function acceptOrderRequest(input) {
  const request = normalizeOrderRequest(input);
  return createOrGetPending(request);
}

module.exports = { acceptOrderRequest };
