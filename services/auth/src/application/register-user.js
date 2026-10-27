const bcrypt = require("bcryptjs");
const { validateRegistration } = require("../domain/registration");
const { createCustomerAccount } = require("../infrastructure/user-repository");

async function registerUser(input) {
  const data = validateRegistration(input);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await createCustomerAccount({
    username: data.username,
    email: data.email,
    phone: data.phone,
    passwordHash,
  });

  return {
    uid: user.uid,
    message: "User registered successfully",
  };
}

module.exports = { registerUser };
