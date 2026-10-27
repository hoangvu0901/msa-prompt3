const fs = require("node:fs");

function replaceOnce(text, before, after) {
  const index = text.indexOf(before);
  if (index < 0 || text.indexOf(before, index + before.length) >= 0) {
    throw new Error("Cannot uniquely locate:\n" + before);
  }
  return text.replace(before, after);
}

const inventoryFile =
  "services/product/src/application/inventory-use-cases.js";
const protoFile = "proto/product.proto";
const handlersFile =
  "services/product/src/interfaces/product-handlers.js";

let inventory = fs.readFileSync(inventoryFile, "utf8");
let proto = fs.readFileSync(protoFile, "utf8");
let handlers = fs.readFileSync(handlersFile, "utf8");

if (!inventory.includes("// COMMIT_STOCK_V1")) {
  inventory = replaceOnce(
    inventory,
    `    if (existing) {
      if (!release && existing.state === "RELEASED") {`,
    `    if (existing && existing.state === "COMMITTED") {
      if (release) {
        fail("CONFLICT", "Committed reservation cannot be released");
      }
      return response(input.pid, existing);
    }

    if (existing) {
      if (!release && existing.state === "RELEASED") {`
  );

  inventory = replaceOnce(
    inventory,
    "module.exports = {",
    `// COMMIT_STOCK_V1
async function commitStock(rawInput) {
  const input = validate(rawInput);

  for (let attempt = 0; attempt < 50; attempt++) {
    const document = await products.findOne({ pid: input.pid });
    if (!document) fail("NOT_FOUND", "Product not found");

    const history = document.reservations || [];
    const index = history.findIndex(
      entry => entry.reservationId === input.reservationId
    );

    if (index < 0) {
      fail("CONFLICT", "Reservation does not exist");
    }

    const existing = history[index];

    if (existing.qty !== input.qty) {
      fail("CONFLICT", "Reservation quantity does not match");
    }

    if (existing.state === "COMMITTED") {
      return response(input.pid, existing);
    }

    if (existing.state !== "HELD") {
      fail("CONFLICT", "Only HELD reservations can be committed");
    }

    const entry = { ...existing, state: "COMMITTED" };
    const nextHistory = [...history];
    nextHistory[index] = entry;

    const result = await products.updateOne(
      {
        _id: document._id,
        reservations: document.reservations,
      },
      {
        $set: {
          reservations: nextHistory,
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 1) {
      return response(input.pid, entry);
    }
  }

  fail("CONFLICT", "Concurrent reservation changes; retry the same request");
}

module.exports = {
  commitStock,`
  );
}

if (!proto.includes("rpc CommitStock")) {
  proto = replaceOnce(
    proto,
    "service ProductService {",
    `service ProductService {
  rpc CommitStock (StockRequest) returns (StockResponse);`
  );
}

if (!handlers.includes("commitStock: handle(inventory.commitStock)")) {
  handlers = replaceOnce(
    handlers,
    "module.exports = {",
    `module.exports = {
  commitStock: handle(inventory.commitStock),`
  );
}

// Validate every patch before writing any file.
for (const [file, content] of [
  [inventoryFile, inventory],
  [protoFile, proto],
  [handlersFile, handlers],
]) {
  if (fs.readFileSync(file, "utf8") === content) {
    console.log("UNCHANGED:", file);
    continue;
  }

  fs.copyFileSync(file, file + ".backup-" + Date.now());
  fs.writeFileSync(file, content);
  console.log("UPDATED:", file);
}
