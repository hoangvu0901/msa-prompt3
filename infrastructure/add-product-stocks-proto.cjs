const fs = require("node:fs");
const file = "proto/product.proto";
let content = fs.readFileSync(file, "utf8");

if (content.includes("rpc GetStocks")) {
  console.log("GetStocks already exists.");
  process.exit(0);
}

if (!content.includes("service ProductService {")) {
  throw new Error("Cannot find ProductService");
}

content = content.replace(
  "service ProductService {",
  `service ProductService {
  rpc GetStocks (StocksRequest) returns (StocksResponse);`
);

content += `
message StocksRequest {
  repeated int32 pids = 1;
}

message StockItem {
  int32 pid = 1;
  int32 quantity = 2;
}

message StocksResponse {
  repeated StockItem items = 1;
}
`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
fs.writeFileSync(file, content);
console.log("Added GetStocks RPC.");
