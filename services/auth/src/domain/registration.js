function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function validateRegistration(input) {
  const username = (input.username || "").trim().toLowerCase();
  const email = (input.email || "").trim().toLowerCase();
  const password = input.password || "";
  const phone = (input.phone || "").trim();

  if (!/^[a-z0-9_]{3,50}$/.test(username)) {
    invalid("Username must contain 3-50 letters, numbers or underscores");
  }

  if (password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
    invalid("Password must have at least 6 characters and at most 72 bytes");
  }

  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid("Invalid email");
  }

  if (phone && !/^\+?[0-9]{9,15}$/.test(phone)) {
    invalid("Invalid phone");
  }

  return { username, email, password, phone };
}

module.exports = { validateRegistration };
