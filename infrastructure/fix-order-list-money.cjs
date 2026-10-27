const fs = require("node:fs");
const file = "services/order/src/infrastructure/order-read-repository.js";
let content = fs.readFileSync(file, "utf8");

const before = "jsonb_agg(to_jsonb(s) ORDER BY s.oid DESC)";
const after = `jsonb_agg(
           to_jsonb(s) || jsonb_build_object(
             'discount_rate', s.discount_rate::text,
             'subtotal', s.subtotal::text,
             'discount', s.discount::text,
             'total_amount', s.total_amount::text
           )
           ORDER BY s.oid DESC
         )`;

if (content.includes(before)) {
  content = content.replace(before, after);
  fs.writeFileSync(file, content);
  console.log("Order list preserves monetary strings.");
} else if (content.includes("'total_amount', s.total_amount::text")) {
  console.log("Monetary string conversion already present.");
} else {
  throw new Error("Cannot locate order list JSON expression");
}
