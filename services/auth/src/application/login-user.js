const bcrypt = require("bcryptjs");
const { validateLogin } = require("../domain/login");
const { findByUsername } = require("../infrastructure/login-repository");
const { issueAccessToken } = require("../infrastructure/token-service");

const dummyHash = bcrypt.hash("dummy-password-never-used", 12);

async function loginUser(input) {
  const data = validateLogin(input);
  const user = await findByUsername(data.username);

  const hash = user ? user.password : await dummyHash;
  const matches = await bcrypt.compare(data.password, hash);

  if (!user || !matches) {
    const error = new Error("Invalid username or password");
    error.kind = "UNAUTHENTICATED";
    throw error;
  }

  return issueAccessToken(user);
}

module.exports = { loginUser };
