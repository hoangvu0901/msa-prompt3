const fs = require("node:fs");

const file = "compose.yaml";
const original = fs.readFileSync(file, "utf8");
const lines = original.replace(/\r\n/g, "\n").split("\n");

const starts = lines
  .map((line, index) => /^  customer-service:\s*$/.test(line) ? index : -1)
  .filter((index) => index >= 0);

if (starts.length !== 1) {
  console.error("STOP: Can dung mot khoi customer-service.");
  process.exit(1);
}

const start = starts[0];
let end = start + 1;

while (end < lines.length) {
  if (/^(?:  )?[A-Za-z0-9_-]+:/.test(lines[end])) break;
  end++;
}

const block = lines.slice(start, end);

if (block.some((line) => /^    healthcheck:/.test(line))) {
  console.log("Customer healthcheck da ton tai.");
  process.exit(0);
}

while (block.length && block[block.length - 1].trim() === "") {
  block.pop();
}

block.push(
  "    healthcheck:",
  '      test: ["CMD", "node", "src/healthcheck.js"]',
  "      interval: 10s",
  "      timeout: 7s",
  "      retries: 5",
  "      start_period: 15s",
  ""
);

fs.copyFileSync(file, file + ".backup-" + Date.now());
lines.splice(start, end - start, ...block);
fs.writeFileSync(file, lines.join("\n"));

console.log("Da them healthcheck cho customer-service.");
