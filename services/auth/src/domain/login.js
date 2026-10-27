function validateLogin(input) {
  const username = (input.username || "").trim().toLowerCase();
  const password = input.password || "";

  if (
    !username ||
    username.length > 50 ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    const error = new Error("Missing or invalid username/password");
    error.kind = "VALIDATION";
    throw error;
  }

  return { username, password };
}

module.exports = { validateLogin };
