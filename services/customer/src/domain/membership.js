function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function validateScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 2147483647) {
    invalid("Score must be a non-negative integer");
  }

  return score;
}

function validateMembership(input) {
  const mname = (input.mname || "").trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(mname)) {
    invalid("Invalid membership name");
  }

  return {
    mname,
    score: validateScore(input.score),
  };
}

module.exports = { validateScore, validateMembership };
