const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;

if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const issuer = "msa-prompt3-auth";
const audience = "msa-prompt3-api";
const expiresIn = 3600;

function issueAccessToken(user) {
  const accessToken = jwt.sign(
    { role: user.rolename },
    secret,
    {
      algorithm: "HS256",
      subject: String(user.uid),
      issuer,
      audience,
      expiresIn,
    }
  );

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn,
  };
}

module.exports = { issueAccessToken };
