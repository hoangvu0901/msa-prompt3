const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;

if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const roles = new Set(["ADMIN", "CUSTOMER", "SHIPMENT_STAFF"]);

function authenticate(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);

  if (!match) {
    return res.status(401).json({
      message: "Bearer token required",
    });
  }

  try {
    const claims = jwt.verify(match[1], secret, {
      algorithms: ["HS256"],
      issuer: "msa-prompt3-auth",
      audience: "msa-prompt3-api",
    });

    if (
      typeof claims !== "object" ||
      typeof claims.sub !== "string" ||
      !/^[1-9][0-9]*$/.test(claims.sub) ||
      !roles.has(claims.role) ||
      !Number.isInteger(claims.exp)
    ) {
      throw new Error("Invalid token claims");
    }

    req.auth = {
      uid: claims.sub,
      role: claims.role,
    };

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({
        message: "Insufficient permission",
      });
    }

    next();
  };
}

module.exports = { authenticate, authorize };
