const fs = require("node:fs");

const protoFile = "proto/product.proto";
const handlersFile =
  "services/product/src/interfaces/product-handlers.js";

let proto = fs.readFileSync(protoFile, "utf8");
let handlers = fs.readFileSync(handlersFile, "utf8");

function replaceOnce(text, before, after) {
  const first = text.indexOf(before);

  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error("Cannot uniquely locate patch anchor:\n" + before);
  }

  return text.replace(before, after);
}

if (!proto.includes("rpc ReserveStock")) {
  proto = replaceOnce(
    proto,
    "service ProductService {",
    `service ProductService {
  rpc ReserveStock (StockRequest) returns (StockResponse);
  rpc ReleaseStock (StockRequest) returns (StockResponse);`
  );

  proto += `
message StockRequest {
  int32 pid = 1;
  int32 qty = 2;
  string reservationId = 3;
}

message StockResponse {
  int32 pid = 1;
  int32 qty = 2;
  string reservationId = 3;
  string state = 4;
  string unit_price = 5;
}
`;
}

if (!handlers.includes("// INVENTORY_RPC_V1")) {
  handlers = `// INVENTORY_RPC_V1
const inventory = require("../application/inventory-use-cases");
` + handlers;

  handlers = replaceOnce(
    handlers,
    "module.exports = {",
    `module.exports = {
  reserveStock: handle(inventory.reserveStock),
  releaseStock: handle(inventory.releaseStock),`
  );
}

if (!handlers.includes("OUT_OF_STOCK: grpc.status.FAILED_PRECONDITION")) {
  handlers = replaceOnce(
    handlers,
    "NOT_FOUND: grpc.status.NOT_FOUND,",
    `NOT_FOUND: grpc.status.NOT_FOUND,
        OUT_OF_STOCK: grpc.status.FAILED_PRECONDITION,`
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
  [protoFile, proto],
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
