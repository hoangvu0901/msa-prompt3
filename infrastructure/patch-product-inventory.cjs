const fs = require("node:fs");

const repositoryFile =
  "services/product/src/infrastructure/product-repository.js";
const handlersFile =
  "services/product/src/interfaces/product-handlers.js";

let repository = fs.readFileSync(repositoryFile, "utf8");
let handlers = fs.readFileSync(handlersFile, "utf8");

function replaceOnce(text, before, after) {
  const first = text.indexOf(before);

  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error("Cannot uniquely locate patch anchor:\n" + before);
  }

  return text.replace(before, after);
}

if (!repository.includes("// INVENTORY_GUARDS_V1")) {
  repository = replaceOnce(
    repository,
    "async function updateProduct(pid, data) {",
    `// INVENTORY_GUARDS_V1
async function rejectInventoryConflict(pid) {
  if (await products.findOne({ pid }, { projection: { _id: 1 } })) {
    const error = new Error("Product has protected reservation records");
    error.kind = "CONFLICT";
    throw error;
  }
}

async function updateProduct(pid, data) {`
  );

  repository = replaceOnce(
    repository,
    `const document = await products.findOneAndUpdate(
    { pid },`,
    `const document = await products.findOneAndUpdate(
    {
      pid,
      reservations: { $not: { $elemMatch: { state: "HELD" } } },
    },`
  );

  repository = replaceOnce(
    repository,
    `  return toResponse(document);
}

async function deleteProduct`,
    `  if (!document) await rejectInventoryConflict(pid);
  return toResponse(document);
}

async function deleteProduct`
  );

  repository = replaceOnce(
    repository,
    `const document = await products.findOneAndDelete(
    { pid },`,
    `const document = await products.findOneAndDelete(
    { pid, "reservations.0": { $exists: false } },`
  );

  repository = replaceOnce(
    repository,
    `  toResponse(document);

  return {
    pid,`,
    `  if (!document) await rejectInventoryConflict(pid);
  toResponse(document);

  return {
    pid,`
  );
}

if (!handlers.includes("CONFLICT: grpc.status.ALREADY_EXISTS")) {
  handlers = replaceOnce(
    handlers,
    "NOT_FOUND: grpc.status.NOT_FOUND,",
    `NOT_FOUND: grpc.status.NOT_FOUND,
        CONFLICT: grpc.status.ALREADY_EXISTS,`
  );
}

for (const [file, content] of [
  [repositoryFile, repository],
  [handlersFile, handlers],
]) {
  const old = fs.readFileSync(file, "utf8");

  if (old !== content) {
    fs.copyFileSync(file, file + ".backup-" + Date.now());
    fs.writeFileSync(file, content);
    console.log("UPDATED:", file);
  } else {
    console.log("UNCHANGED:", file);
  }
}
