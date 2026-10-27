const fs = require("node:fs");

const protoFile = "proto/customer.proto";
const handlerFile = "services/customer/src/interfaces/customer-handlers.js";

let proto = fs.readFileSync(protoFile, "utf8");
let handlers = fs.readFileSync(handlerFile, "utf8");

if (!proto.includes("rpc UpdateCustomer")) {
  const anchor =
    "  rpc GetCustomer (GetCustomerRequest) returns (CustomerResponse);";

  if (!proto.includes(anchor)) {
    console.error("STOP: Khong tim thay GetCustomer trong proto.");
    process.exit(1);
  }

  proto = proto.replace(
    anchor,
    anchor + "\n  rpc UpdateCustomer (UpdateCustomerRequest) returns (CustomerResponse);"
  );

  proto += `
message UpdateCustomerRequest {
  int32 uid = 1;
  string fullname = 2;
  int32 mid = 3;
  bool updateFullname = 4;
  bool updateMembership = 5;
}
`;
}

if (!handlers.includes("module.exports.updateCustomer")) {
  handlers += `
const { updateCustomer } = require("../application/update-customer");
module.exports.updateCustomer = handle(updateCustomer);
`;
}

const suffix = ".backup-" + Date.now();
fs.copyFileSync(protoFile, protoFile + suffix);
fs.copyFileSync(handlerFile, handlerFile + suffix);

fs.writeFileSync(protoFile, proto);
fs.writeFileSync(handlerFile, handlers);

console.log("Da them UpdateCustomer vao gRPC.");
