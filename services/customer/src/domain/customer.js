function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function validateUid(uid) {
  if (!Number.isInteger(uid) || uid <= 0) {
    invalid("uid must be a positive integer");
  }

  return uid;
}

function validateNewCustomer(input) {
  const uid = validateUid(input.uid);
  const fullname = (input.fullname || "").trim();

  if ([...fullname].length > 100) {
    invalid("Fullname must not exceed 100 characters");
  }

  return { uid, fullname };
}

module.exports = { validateUid, validateNewCustomer };
