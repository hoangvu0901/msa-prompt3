const {
  validateUid,
  validateNewCustomer,
} = require("../domain/customer");

const repository = require("../infrastructure/customer-repository");

async function createCustomer(input) {
  const data = validateNewCustomer(input);
  return repository.createIfMissing(data);
}

async function getCustomer(input) {
  const uid = validateUid(input.uid);
  const customer = await repository.findByUid(uid);

  if (!customer) {
    const error = new Error("Customer not found");
    error.kind = "NOT_FOUND";
    throw error;
  }

  return customer;
}

module.exports = { createCustomer, getCustomer };
