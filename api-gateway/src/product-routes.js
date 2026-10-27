// Live product stock enabled
const { refreshProductStock } = require("./product-live-stock");
// Product Redis cache enabled
const { readProductCache, invalidateProductCache } = require("./product-cache");
const express = require("express");
const { authenticate, authorize } = require("./middleware/auth");
const { callProduct } = require("./product-client");
const { grpc } = require("./auth-client");

const router = express.Router();

function toRest(product) {
  return {
    pid: product.pid,
    pname: product.pname,
    price: Number(product.price),
    quantity: product.quantity,
  };
}

function sendError(res, error) {
  const statuses = {
    [grpc.status.INVALID_ARGUMENT]: 400,
    [grpc.status.NOT_FOUND]: 404,
    [grpc.status.ALREADY_EXISTS]: 409,
    [grpc.status.DEADLINE_EXCEEDED]: 504,
  };

  const status = statuses[error.code] || 503;

  return res.status(status).json({
    message: status >= 500
      ? "Product service unavailable"
      : error.details,
  });
}

function validatePid(req, res, next) {
  const raw = req.params.pid;
  const pid = Number(raw);

  if (
    !/^[1-9][0-9]*$/.test(raw) ||
    !Number.isInteger(pid) ||
    pid > 2147483647
  ) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  req.productPid = pid;
  next();
}

function validateProductBody(req, res, next) {
  const body = req.body;
  const fields = ["pname", "price", "quantity"];

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(body, field)) ||
    typeof body.pname !== "string" ||
    typeof body.price !== "number" ||
    !Number.isFinite(body.price) ||
    !Number.isInteger(body.quantity) ||
    body.quantity < 0 ||
    body.quantity > 2147483647
  ) {
    return res.status(400).json({
      message: "Provide pname, numeric price and non-negative integer quantity",
    });
  }

  req.productInput = {
    pname: body.pname,
    price: String(body.price),
    quantity: body.quantity,
  };

  next();
}

router.get("/api/products", authenticate, async (req, res) => {
  const rawPage = req.query.page ?? "1";
  const rawPageSize = req.query.pageSize ?? "20";

  if (
    typeof rawPage !== "string" ||
    typeof rawPageSize !== "string" ||
    !/^[1-9][0-9]*$/.test(rawPage) ||
    !/^[1-9][0-9]*$/.test(rawPageSize)
  ) {
    return res.status(400).json({ message: "Invalid pagination" });
  }

  const page = Number(rawPage);
  const pageSize = Number(rawPageSize);

  if (
    !Number.isSafeInteger(page) ||
    page > 2147483647 ||
    !Number.isInteger(pageSize) ||
    pageSize > 100
  ) {
    return res.status(400).json({ message: "Invalid pagination" });
  }

  try {
    const cached = await readProductCache(
      "list:" + page + ":" + pageSize,
      () => callProduct("listProducts", { page, pageSize })
    );
    const fresh = await refreshProductStock(
      cached,
      () => callProduct("listProducts", { page, pageSize })
    );
    const result = fresh.data;
    res.setHeader("X-Cache", fresh.cache);
    res.setHeader("X-Stock-Source", "product-service");

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...result,
      items: result.items.map(toRest),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get(
  "/api/products/:pid",
  authenticate,
  validatePid,
  async (req, res) => {
    try {
      const cached = await readProductCache(
        "detail:" + req.productPid,
        () => callProduct("getProduct", { pid: req.productPid })
      );
      const fresh = await refreshProductStock(cached);
      const result = fresh.data;
      res.setHeader("X-Cache", fresh.cache);
      res.setHeader("X-Stock-Source", "product-service");

      res.setHeader("Cache-Control", "no-store");
      res.json(toRest(result));
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  "/api/products",
  authenticate,
  authorize("ADMIN"),
  validateProductBody,
  async (req, res) => {
    try {
      const result = await callProduct("createProduct", req.productInput);
      res.setHeader(
        "X-Cache-Invalidation",
        await invalidateProductCache()
      );
      res.status(201).json(toRest(result));
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.put(
  "/api/products/:pid",
  authenticate,
  authorize("ADMIN"),
  validatePid,
  validateProductBody,
  async (req, res) => {
    try {
      const result = await callProduct("updateProduct", {
        pid: req.productPid,
        ...req.productInput,
      });
      res.setHeader(
        "X-Cache-Invalidation",
        await invalidateProductCache()
      );

      res.json({
        message: "Product updated successfully",
        pid: result.pid,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.delete(
  "/api/products/:pid",
  authenticate,
  authorize("ADMIN"),
  validatePid,
  async (req, res) => {
    try {
      const result = await callProduct("deleteProduct", {
        pid: req.productPid,
      });
      res.setHeader(
        "X-Cache-Invalidation",
        await invalidateProductCache()
      );

      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

module.exports = router;
