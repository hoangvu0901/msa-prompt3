const { validateUid } = require("../domain/customer");
const { updateCustomerRecord } = require("../infrastructure/update-repository");

function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

async function updateCustomer(input) {
  const uid = validateUid(input.uid);
  const updateFullname = input.updateFullname === true;
  const updateMembership = input.updateMembership === true;

  if (!updateFullname && !updateMembership) {
    invalid("No update fields provided");
  }

  const fullname = (input.fullname || "").trim();

  if (
    updateFullname &&
    (!fullname || [...fullname].length > 100)
  ) {
    invalid("Fullname must contain 1-100 characters");
  }

  if (
    updateMembership &&
    (!Number.isInteger(input.mid) || input.mid <= 0)
  ) {
    invalid("Invalid membership ID");
  }

  return updateCustomerRecord({
    uid,
    fullname,
    mid: updateMembership ? input.mid : null,
    updateFullname,
    updateMembership,
  });
}

module.exports = { updateCustomer };
