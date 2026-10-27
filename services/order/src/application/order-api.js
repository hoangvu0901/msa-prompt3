const { acceptOrderRequest } = require("./accept-order-request");
const repository = require("../infrastructure/order-read-repository");

function fail(kind, message) {
  const error = new Error(message);
  error.kind = kind;
  throw error;
}

function positive(value, field) {
  if (!Number.isInteger(value) || value <= 0 || value > 2147483647) {
    fail("VALIDATION", "Invalid " + field);
  }
  return value;
}

function actor(input, allowed) {
  if (!input.actor) fail("PERMISSION", "Caller identity required");

  positive(input.actor.uid, "actor uid");

  if (!allowed.includes(input.actor.role)) {
    fail("PERMISSION", "Access denied");
  }

  return input.actor;
}

async function createOrder(input) {
  const caller = actor(input, ["CUSTOMER"]);

  const accepted = await acceptOrderRequest({
    uid: caller.uid,
    requestId: input.requestId,
    items: input.items,
  });

  const order = await repository.getOrder(accepted.order.oid);

  if (!order) throw new Error("Accepted order could not be read");

  return {
    created: accepted.created,
    order,
  };
}

async function getOrder(input) {
  const caller = actor(input, ["CUSTOMER", "ADMIN"]);
  const oid = positive(input.oid, "oid");
  const order = await repository.getOrder(oid);

  if (!order) fail("NOT_FOUND", "Order not found");

  if (caller.role === "CUSTOMER" && order.uid !== caller.uid) {
    fail("PERMISSION", "Access denied");
  }

  return order;
}

async function listOrders(input) {
  const caller = actor(input, ["CUSTOMER", "ADMIN"]);
  const page = positive(input.page || 1, "page");
  const pageSize = positive(input.pageSize || 20, "pageSize");

  if (pageSize > 100) fail("VALIDATION", "pageSize must not exceed 100");

  return repository.listOrders({
    uid: caller.role === "ADMIN" ? null : caller.uid,
    page,
    pageSize,
  });
}

module.exports = { createOrder, getOrder, listOrders };
