const { validateUid } = require("../domain/customer");
const {
  validateMembership,
  validateScore,
} = require("../domain/membership");
const repository = require("../infrastructure/membership-repository");

async function listMemberships() {
  return repository.listMemberships();
}

async function createMembership(input) {
  return repository.createMembership(validateMembership(input));
}

async function updateMembershipScore(input) {
  const mid = validateUid(input.mid);
  const score = validateScore(input.score);

  return repository.updateMembershipScore(mid, score);
}

module.exports = {
  listMemberships,
  createMembership,
  updateMembershipScore,
};
