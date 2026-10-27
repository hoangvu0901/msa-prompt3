const {
  normalizeOrderCreated,
} = require("../domain/order-created");
const {
  createFromOrder,
} = require("../infrastructure/shipment-repository");

async function handleOrderCreated(event) {
  return createFromOrder(normalizeOrderCreated(event));
}

module.exports = { handleOrderCreated };
