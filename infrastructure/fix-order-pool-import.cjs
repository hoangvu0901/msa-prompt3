const fs = require("node:fs");

const changes = [
  [
    "services/order/src/infrastructure/order-request-repository.js",
    'const { pool } = require("./database");',
    `const databaseModule = require("./database");
const pool = databaseModule.pool || databaseModule;`,
  ],
  [
    "services/order/src/test-order-idempotency.js",
    'const { pool } = require("./infrastructure/database");',
    `const databaseModule = require("./infrastructure/database");
const pool = databaseModule.pool || databaseModule;`,
  ],
];

const updates = changes.map(([file, before, after]) => {
  const content = fs.readFileSync(file, "utf8");

  if (content.includes(after)) {
    return { file, content, changed: false };
  }

  if (!content.includes(before)) {
    throw new Error("Cannot find expected import in " + file);
  }

  return {
    file,
    content: content.replace(before, after),
    changed: true,
  };
});

for (const update of updates) {
  if (!update.changed) {
    console.log("UNCHANGED:", update.file);
    continue;
  }

  fs.copyFileSync(
    update.file,
    update.file + ".backup-" + Date.now()
  );
  fs.writeFileSync(update.file, update.content);
  console.log("UPDATED:", update.file);
}
