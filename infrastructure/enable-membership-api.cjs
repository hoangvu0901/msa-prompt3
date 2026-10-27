const fs = require("node:fs");

const protoFile = "proto/customer.proto";
const handlerFile = "services/customer/src/interfaces/customer-handlers.js";
const gatewayFile = "api-gateway/src/server.js";

let proto = fs.readFileSync(protoFile, "utf8");
let handlers = fs.readFileSync(handlerFile, "utf8");
let gateway = fs.readFileSync(gatewayFile, "utf8");

if (!proto.includes("rpc ListMemberships")) {
  const anchor = "service CustomerService {";

  if (!proto.includes(anchor)) {
    console.error("STOP: Khong tim thay CustomerService.");
    process.exit(1);
  }

  proto = proto.replace(anchor, `${anchor}
  rpc ListMemberships (MembershipListRequest) returns (MembershipListResponse);
  rpc CreateMembership (CreateMembershipRequest) returns (MembershipResponse);
  rpc UpdateMembershipScore (UpdateMembershipScoreRequest) returns (MembershipResponse);
`);

  proto += `
message MembershipListRequest {}

message MembershipResponse {
  int32 mid = 1;
  string mname = 2;
  int32 score = 3;
}

message MembershipListResponse {
  repeated MembershipResponse items = 1;
}

message CreateMembershipRequest {
  string mname = 1;
  int32 score = 2;
}

message UpdateMembershipScoreRequest {
  int32 mid = 1;
  int32 score = 2;
}
`;
}

if (!handlers.includes('require("./membership-handlers")')) {
  handlers += `
Object.assign(module.exports, require("./membership-handlers"));
`;
}

const importLine =
  'const membershipRoutes = require("./membership-routes");';

if (!gateway.includes(importLine)) {
  const anchor = "app.use(customerRoutes);";

  if (!gateway.includes(anchor)) {
    console.error("STOP: Khong tim thay customerRoutes.");
    process.exit(1);
  }

  gateway = importLine + "\n" + gateway.replace(
    anchor,
    anchor + "\napp.use(membershipRoutes);"
  );
}

const suffix = ".backup-" + Date.now();

for (const file of [protoFile, handlerFile, gatewayFile]) {
  fs.copyFileSync(file, file + suffix);
}

fs.writeFileSync(protoFile, proto);
fs.writeFileSync(handlerFile, handlers);
fs.writeFileSync(gatewayFile, gateway);

console.log("Da them Membership API.");
