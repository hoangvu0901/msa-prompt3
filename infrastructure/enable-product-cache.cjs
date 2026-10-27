const fs = require("node:fs");

const file = "api-gateway/src/product-routes.js";
const original = fs.readFileSync(file, "utf8");
let source = original.replace(/\r\n/g, "\n");

const marker = "// Product Redis cache enabled";

if (source.includes(marker)) {
  console.log("Product cache da duoc them.");
  process.exit(0);
}

const changes = [
  [
    'const result = await callProduct("listProducts", { page, pageSize });',
    `const cached = await readProductCache(
      "list:" + page + ":" + pageSize,
      () => callProduct("listProducts", { page, pageSize })
    );
    const result = cached.data;
    res.setHeader("X-Cache", cached.cache);`,
  ],
  [
    `const result = await callProduct("getProduct", {
        pid: req.productPid,
      });`,
    `const cached = await readProductCache(
        "detail:" + req.productPid,
        () => callProduct("getProduct", { pid: req.productPid })
      );
      const result = cached.data;
      res.setHeader("X-Cache", cached.cache);`,
  ],
  [
    'const result = await callProduct("createProduct", req.productInput);',
    `const result = await callProduct("createProduct", req.productInput);
      res.setHeader(
        "X-Cache-Invalidation",
        await invalidateProductCache()
      );`,
  ],
  [
    `const result = await callProduct("updateProduct", {
        pid: req.productPid,
        ...req.productInput,
      });`,
    `const result = await callProduct("updateProduct", {
        pid: req.productPid,
        ...req.productInput,
      });
      res.setHeader(
        "X-Cache-Invalidation",
        await invalidateProductCache()
      );`,
  ],
  [
    `const result = await callProduct("deleteProduct", {
        pid: req.productPid,
      });`,
    `const result = await callProduct("deleteProduct", {
        pid: req.productPid,
      });
      res.setHeader(
        "X-Cache-Invalidation",
        await invalidateProductCache()
      );`,
  ],
];

for (let i = 0; i < changes.length; i++) {
  if (!source.includes(changes[i][0])) {
    console.error(
      "STOP: Khong tim thay doan code can sua, vi tri " + (i + 1)
    );
    process.exit(1);
  }
}

for (const [before, after] of changes) {
  source = source.replace(before, () => after);
}

source = [
  marker,
  'const { readProductCache, invalidateProductCache } = require("./product-cache");',
  source,
].join("\n");

fs.copyFileSync(file, file + ".backup-" + Date.now());
fs.writeFileSync(file, source);

console.log("Da them cache vao GET va invalidation vao POST/PUT/DELETE.");
