// Demo policy: replace thresholds if the assignment specifies another policy.
// Basis points: 100 = 1%, 500 = 5%, 1000 = 10%.

const DISCOUNT_TIERS = [
  { minimumScore: 500, rateBps: 1000 },
  { minimumScore: 100, rateBps: 500 },
  { minimumScore: 0, rateBps: 0 },
];

function discountRateBps(score) {
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 2147483647
  ) {
    const error = new Error("Membership score must be a non-negative integer");
    error.kind = "VALIDATION";
    throw error;
  }

  return DISCOUNT_TIERS.find(
    (tier) => score >= tier.minimumScore
  ).rateBps;
}

module.exports = { discountRateBps };
