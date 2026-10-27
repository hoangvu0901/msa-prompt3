const { Decimal128 } = require("mongodb");
const { database } = require("./database");

const products = database.collection("products");
const counters = database.collection("counters");

function toResponse(document) {
  if (!document) {
    const error = new Error("Product not found");
    error.kind = "NOT_FOUND";
    throw error;
  }

  return {
    pid: document.pid,
    pname: document.pname,
    price: document.price.toString(),
    quantity: document.quantity,
  };
}

async function createProduct(data) {
  const counter = await counters.findOneAndUpdate(
    { _id: "product_pid" },
    { $inc: { seq: 1 } },
    {
      returnDocument: "after",
      includeResultMetadata: false,
    }
  );

  if (
    !counter ||
    !Number.isInteger(counter.seq) ||
    counter.seq <= 0 ||
    counter.seq > 2147483647
  ) {
    throw new Error("Product counter is missing or exhausted");
  }

  const document = {
    pid: counter.seq,
    pname: data.pname,
    price: Decimal128.fromString(data.price),
    quantity: data.quantity,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await products.insertOne(document);
  return toResponse(document);
}

async function getProduct(pid) {
  return toResponse(await products.findOne({ pid }));
}

async function listProducts({ page, pageSize }) {
  const [documents, total] = await Promise.all([
    products.find({})
      .sort({ pid: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    products.countDocuments(),
  ]);

  return {
    items: documents.map(toResponse),
    page,
    pageSize,
    total,
  };
}

// INVENTORY_GUARDS_V1
async function rejectInventoryConflict(pid) {
  if (await products.findOne({ pid }, { projection: { _id: 1 } })) {
    const error = new Error("Product has protected reservation records");
    error.kind = "CONFLICT";
    throw error;
  }
}

async function updateProduct(pid, data) {
  const document = await products.findOneAndUpdate(
    {
      pid,
      reservations: { $not: { $elemMatch: { state: "HELD" } } },
    },
    {
      $set: {
        pname: data.pname,
        price: Decimal128.fromString(data.price),
        quantity: data.quantity,
        updated_at: new Date(),
      },
    },
    {
      returnDocument: "after",
      includeResultMetadata: false,
    }
  );

  if (!document) await rejectInventoryConflict(pid);
  return toResponse(document);
}

async function deleteProduct(pid) {
  const document = await products.findOneAndDelete(
    { pid, "reservations.0": { $exists: false } },
    { includeResultMetadata: false }
  );

  if (!document) await rejectInventoryConflict(pid);
  toResponse(document);

  return {
    pid,
    message: "Product deleted successfully",
  };
}

module.exports = {
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
  deleteProduct,
};
