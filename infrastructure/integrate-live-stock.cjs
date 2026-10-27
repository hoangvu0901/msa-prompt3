const fs = require("node:fs");
const file = "api-gateway/src/product-routes.js";
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

if (content.includes("// Live product stock enabled")) {
  console.log("Live stock already integrated.");
  process.exit(0);
}

function replaceOnce(before, after) {
  const index = content.indexOf(before);

  if (index < 0 || content.indexOf(before, index + before.length) >= 0) {
    throw new Error("Cannot uniquely locate:\n" + before);
  }

  content = content.replace(before, after);
}

replaceOnce(
  `    const result = cached.data;
    res.setHeader("X-Cache", cached.cache);`,
  `    const fresh = await refreshProductStock(
      cached,
      () => callProduct("listProducts", { page, pageSize })
    );
    const result = fresh.data;
    res.setHeader("X-Cache", fresh.cache);
    res.setHeader("X-Stock-Source", "product-service");`
);

replaceOnce(
  `      const result = cached.data;
      res.setHeader("X-Cache", cached.cache);`,
  `      const fresh = await refreshProductStock(cached);
      const result = fresh.data;
      res.setHeader("X-Cache", fresh.cache);
      res.setHeader("X-Stock-Source", "product-service");`
);

content = `// Live product stock enabled
const { refreshProductStock } = require("./product-live-stock");
` + content;

fs.copyFileSync(file, file + ".backup-" + Date.now());
fs.writeFileSync(file, content);
console.log("Integrated live stock into product detail and list.");
