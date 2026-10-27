const fs = require("node:fs");
const file = "services/product/src/interfaces/product-handlers.js";
let content = fs.readFileSync(file, "utf8");

const line =
  'module.exports.getStocks = require("./stock-handlers").getStocks;';

if (!content.includes(line)) {
  fs.copyFileSync(file, file + ".backup-" + Date.now());
  fs.appendFileSync(file, "\n" + line + "\n");
  console.log("Registered GetStocks handler.");
} else {
  console.log("GetStocks handler already registered.");
}
