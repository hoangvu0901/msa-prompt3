const fs = require("node:fs");

fs.mkdirSync("docs", { recursive: true });

function event(listen, code) {
  return {
    listen,
    script: {
      type: "text/javascript",
      exec: code.split("\n"),
    },
  };
}

function request(name, method, path, token, body, codes, after = "", before = "") {
  const item = {
    name,
    request: {
      method,
      header: [],
      auth: token
        ? {
            type: "bearer",
            bearer: [{
              key: "token",
              value: "{{" + token + "}}",
              type: "string",
            }],
          }
        : { type: "noauth" },
      url: "{{baseUrl}}" + path,
    },
    event: [],
  };

  if (body !== undefined) {
    item.request.header.push({
      key: "Content-Type",
      value: "application/json",
    });

    item.request.body = {
      mode: "raw",
      raw: typeof body === "string"
        ? body
        : JSON.stringify(body, null, 2),
      options: { raw: { language: "json" } },
    };
  }

  if (before) item.event.push(event("prerequest", before));

  item.event.push(event("test", `
pm.test("Expected HTTP status", function () {
  pm.expect(pm.response.code).to.be.oneOf(${JSON.stringify(codes)});
});
if (${JSON.stringify(codes)}.includes(pm.response.code)) {
  ${after}
}
`.trim()));

  return item;
}

const save = (key, expression) =>
  `pm.collectionVariables.set("${key}", ${expression});`;

const items = [];

items.push(request(
  "01 - Health", "GET", "/api/health",
  null, undefined, [200],
  `pm.test("System UP", () => {
    pm.expect(pm.response.json().status).to.eql("UP");
  });`
));

for (const [number, role] of [["02", "admin"], ["03", "staff"]]) {
  items.push(request(
    `${number} - Login ${role}`,
    "POST", "/api/auth/login", null,
    {
      username: "{{" + role + "Username}}",
      password: "{{" + role + "Password}}",
    },
    [200],
    save(role + "Token", "pm.response.json().accessToken")
  ));
}

items.push(request(
  "04 - Register new customer",
  "POST", "/api/auth/register", null,
  {
    username: "{{customerUsername}}",
    password: "{{customerPassword}}",
    email: "{{customerUsername}}@example.com",
  },
  [201],
  save("uid", "pm.response.json().uid"),
  `
const suffix = pm.variables.replaceIn("{{$guid}}").replace(/-/g, "");
pm.collectionVariables.set("customerUsername", "demo_" + suffix);
pm.collectionVariables.set("customerPassword", "Demo_" + suffix);
pm.collectionVariables.set("membershipName", "DEMO_" + suffix);
pm.collectionVariables.set("requestId", pm.variables.replaceIn("{{$guid}}"));
for (const key of ["customerToken", "uid", "mid", "pid", "oid", "shipid"]) {
  pm.collectionVariables.unset(key);
}
`.trim()
));

items.push(request(
  "05 - Login customer",
  "POST", "/api/auth/login", null,
  {
    username: "{{customerUsername}}",
    password: "{{customerPassword}}",
  },
  [200], save("customerToken", "pm.response.json().accessToken")
));

items.push(request(
  "06 - Customer identity",
  "GET", "/api/auth/me", "customerToken",
  undefined, [200]
));

items.push(request(
  "07 - Admin creates membership score 100",
  "POST", "/api/memberships", "adminToken",
  { mname: "{{membershipName}}", score: 100 },
  [201], save("mid", "pm.response.json().mid")
));

items.push(request(
  "08 - Admin assigns membership",
  "PUT", "/api/customers/{{uid}}", "adminToken",
  '{"mid": {{mid}}}', [200]
));

items.push(request(
  "09 - Customer reads profile",
  "GET", "/api/customers/{{uid}}", "customerToken",
  undefined, [200]
));

items.push(request(
  "10 - Admin creates product",
  "POST", "/api/products", "adminToken",
  { pname: "Demo Product", price: 150000, quantity: 10 },
  [201], save("pid", "pm.response.json().pid")
));

items.push(request(
  "11 - Customer reads product - send twice to view cache",
  "GET", "/api/products/{{pid}}", "customerToken",
  undefined, [200]
));

items.push(request(
  "12 - Customer cannot create product",
  "POST", "/api/products", "customerToken",
  { pname: "Forbidden Product", price: 1000, quantity: 1 },
  [403]
));

items.push(request(
  "13 - Create order - same requestId for retries",
  "POST", "/api/orders", "customerToken",
  `{
  "requestId": "{{requestId}}",
  "items": [{"pid": {{pid}}, "qty": 2}]
}`,
  [200, 201, 202],
  save("oid", "pm.response.json().order.oid")
));

items.push(request(
  "14 - Wait for CONFIRMED - resend this request if pending",
  "GET", "/api/orders/{{oid}}", "customerToken",
  undefined, [200],
  `
const order = pm.response.json();
pm.test("Order confirmed and stock committed", () => {
  pm.expect(order.status).to.eql("CONFIRMED");
  pm.expect(order.stock_committed).to.eql(true);
});
if (order.status === "CONFIRMED") {
  pm.test("Correct discount and total", () => {
    pm.expect(order.subtotal).to.eql("300000.00");
    pm.expect(order.discount).to.eql("15000.00");
    pm.expect(order.total_amount).to.eql("285000.00");
  });
}
`.trim()
));

items.push(request(
  "15 - Confirmed retry returns same order",
  "POST", "/api/orders", "customerToken",
  `{
  "requestId": "{{requestId}}",
  "items": [{"pid": {{pid}}, "qty": 2}]
}`,
  [200],
  `
const result = pm.response.json();
pm.test("No duplicate order", () => {
  pm.expect(result.created).to.eql(false);
  pm.expect(String(result.order.oid)).to.eql(
    String(pm.collectionVariables.get("oid"))
  );
});
`.trim()
));

items.push(request(
  "16 - Changed content with same requestId is rejected",
  "POST", "/api/orders", "customerToken",
  `{
  "requestId": "{{requestId}}",
  "items": [{"pid": {{pid}}, "qty": 3}]
}`,
  [409]
));

items.push(request(
  "17 - Stock is 8 after order and retry",
  "GET", "/api/products/{{pid}}", "customerToken",
  undefined, [200],
  `pm.test("Stock deducted exactly once", () => {
    pm.expect(pm.response.json().quantity).to.eql(8);
  });`
));

items.push(request(
  "18 - Wait for Shipment - resend if 404",
  "GET", "/api/shipments/by-order/{{oid}}", "customerToken",
  undefined, [200],
  save("shipid", "pm.response.json().shipid")
));

items.push(request(
  "19 - Customer cannot update shipment",
  "PATCH", "/api/shipments/{{shipid}}/status", "customerToken",
  { status: "SHIPPING" }, [403]
));

items.push(request(
  "20 - Staff cannot skip SHIPPING",
  "PATCH", "/api/shipments/{{shipid}}/status", "staffToken",
  { status: "DELIVERED" }, [409]
));

items.push(request(
  "21 - Staff starts shipping",
  "PATCH", "/api/shipments/{{shipid}}/status", "staffToken",
  { status: "SHIPPING" }, [200]
));

items.push(request(
  "22 - Staff completes delivery",
  "PATCH", "/api/shipments/{{shipid}}/status", "staffToken",
  { status: "DELIVERED" }, [200]
));

items.push(request(
  "23 - Customer sees DELIVERED",
  "GET", "/api/shipments/{{shipid}}", "customerToken",
  undefined, [200],
  `pm.test("Delivered", () => {
    pm.expect(pm.response.json().status).to.eql("DELIVERED");
  });`
));

items.push(request(
  "24 - Product endpoint requires JWT",
  "GET", "/api/products", null,
  undefined, [401]
));

const variables = {
  baseUrl: "http://127.0.0.1:3003",
  adminUsername: "",
  adminPassword: "",
  staffUsername: "",
  staffPassword: "",
  adminToken: "",
  staffToken: "",
  customerToken: "",
  customerUsername: "",
  customerPassword: "",
  membershipName: "",
  requestId: "",
  uid: "",
  mid: "",
  pid: "",
  oid: "",
  shipid: "",
};

const collection = {
  info: {
    name: "MSA Prompt3 - MVP Demo",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "Run manually in numbered order. Wait for CONFIRMED and Shipment before continuing. Credentials must be entered locally.",
  },
  variable: Object.entries(variables).map(([key, value]) => ({
    key, value, type: "string",
  })),
  item: items,
};

fs.writeFileSync(
  "docs/MSA-Prompt3.postman_collection.json",
  JSON.stringify(collection, null, 2) + "\n"
);

const readme = [
  "# Ecommerce MVP - Microservices",
  "",
  "Backend Node.js theo Microservices, DDD và Database-per-Service.",
  "",
  "## Kiến trúc",
  "",
  "| Thành phần | Trách nhiệm | Lưu trữ / cổng nội bộ |",
  "|---|---|---|",
  "| API Gateway | REST routing, JWT, phân quyền, rate limit, logging, cache | Redis / 3002 |",
  "| Auth | Đăng ký, đăng nhập, role | PostgreSQL / gRPC 50051 |",
  "| Customer | Hồ sơ, hạng thành viên, score | PostgreSQL / gRPC 50052 |",
  "| Product | Sản phẩm, tồn kho, reservation | MongoDB / gRPC 50053 |",
  "| Order | Đơn hàng, chi tiết, discount, outbox | PostgreSQL / gRPC 50054 |",
  "| Shipment | Tiếp nhận đơn hàng, trạng thái giao hàng | MongoDB / gRPC 50055 |",
  "",
  "Mỗi service quản lý database của mình; không truy cập bảng của service khác.",
  "Các lớp mã nguồn: domain, application, infrastructure, interfaces.",
  "",
  "Order worker xử lý đơn và tồn kho. Outbox worker phát OrderCreated lên Kafka.",
  "Shipment consumer tiếp nhận sự kiện và tạo shipment chống trùng.",
  "Sự kiện có thể được giao lại; consumer xử lý idempotent.",
  "",
  "## Quy tắc MVP",
  "",
  "- Score là điểm của hạng thành viên.",
  "- Score 0–99: giảm 0%; 100–499: giảm 5%; từ 500: giảm 10%.",
  "- Đây là chính sách discount dùng cho bài thực hành.",
  "- Giá, score và số tiền được chụp lại khi xử lý đơn.",
  "- Một order tạo một shipment trong phạm vi MVP.",
  "- Shipment: PENDING -> SHIPPING -> DELIVERED.",
  "- CUSTOMER đặt hàng; ADMIN quản trị; SHIPMENT_STAFF cập nhật giao hàng.",
  "- Retry cùng khách hàng và requestId không tạo đơn mới.",
  "- Cùng requestId nhưng nội dung khác bị từ chối.",
  "- Order API trả 202 khi xử lý chưa hoàn tất; client đọc lại trạng thái.",
  "",
  "## Chuẩn bị",
  "",
  "- Docker Desktop chạy Linux containers, Docker Compose hỗ trợ !override.",
  "- Node.js 24 để chạy script kiểm thử trên máy.",
  "- Git Bash trên Windows cho các lệnh shell.",
  "- File .env chứa các biến được yêu cầu trong compose.yaml.",
  "- Không đưa .env, mật khẩu hoặc JWT lên Git.",
  "",
  "Các biến trong .env:",
  "",
  "AUTH_DB_PASSWORD, CUSTOMER_DB_PASSWORD, ORDER_DB_PASSWORD,",
  "PRODUCT_MONGO_USER, PRODUCT_MONGO_PASSWORD, PRODUCT_APP_PASSWORD,",
  "SHIPMENT_MONGO_USER, SHIPMENT_MONGO_PASSWORD, SHIPMENT_APP_PASSWORD, JWT_SECRET.",
  "",
  "Tạo .env.admin.local với BOOTSTRAP_ADMIN_USERNAME,",
  "BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD.",
  "Tạo .env.shipment-staff.local với BOOTSTRAP_STAFF_USERNAME,",
  "BOOTSTRAP_STAFF_EMAIL, BOOTSTRAP_STAFF_PASSWORD.",
  "Dùng cú pháp KEY='value' để có thể source bằng Git Bash.",
  "",
  "## Cài mới trong môi trường kiểm tra",
  "",
  "Chạy từ thư mục gốc:",
  "",
  "```bash",
  "bash infrastructure/test-clean-start.sh",
  "```",
  "",
  "Script dùng project msa-prompt3-clean, volume riêng và Gateway cổng 3003.",
  "Script từ chối chạy khi project này đã có volume; không dùng nó để restart.",
  "Thứ tự: database -> SQL/migrations -> Mongo app users/indexes -> topic -> services.",
  "",
  "Nạp tài khoản và tạo ADMIN/STAFF:",
  "",
  "```bash",
  "set -a",
  "source .env.admin.local",
  "source .env.shipment-staff.local",
  "set +a",
  "",
  "dc() {",
  "  docker compose -p msa-prompt3-clean -f compose.yaml -f compose.clean.yaml \"$@\"",
  "}",
  "",
  "dc exec -T -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD auth-service node src/seed-admin.js",
  "dc exec -T -e BOOTSTRAP_STAFF_USERNAME -e BOOTSTRAP_STAFF_EMAIL -e BOOTSTRAP_STAFF_PASSWORD auth-service node src/seed-shipment-staff.js",
  "```",
  "",
  "## Khởi động lại và dừng",
  "",
  "Môi trường kiểm tra đã được khởi tạo:",
  "",
  "```bash",
  "docker compose -p msa-prompt3-clean -f compose.yaml -f compose.clean.yaml up -d --wait --wait-timeout 240",
  "docker compose -p msa-prompt3-clean -f compose.yaml -f compose.clean.yaml stop",
  "```",
  "",
  "Môi trường thực hành cũ đã được khởi tạo: docker compose up -d --wait.",
  "Gateway môi trường cũ: http://127.0.0.1:3002.",
  "Gateway môi trường kiểm tra: http://127.0.0.1:3003.",
  "",
  "## Kiểm thử",
  "",
  "Sau khi nạp các biến ADMIN/STAFF:",
  "",
  "```bash",
  "TEST_API_BASE=http://127.0.0.1:3003 node.exe services/order/src/test-e2e-rest.js",
  "```",
  "",
  "Kết quả mong đợi: ALL REST E2E CHECKS PASSED.",
  "E2E tạo dữ liệu mới cho mỗi lần chạy.",
  "Kết quả E2E: subtotal 600000.00, discount 30000.00, total 570000.00.",
  "",
  "Import docs/MSA-Prompt3.postman_collection.json để demo thủ công.",
  "Điền tài khoản trong Variables; gửi request theo thứ tự.",
  "Đợi Order CONFIRMED và Shipment được tạo trước khi cập nhật giao hàng.",
  "Postman demo dùng một sản phẩm: subtotal 300000.00, total 285000.00.",
  "",
  "## Giới hạn",
  "",
  "- Cấu hình local một Kafka broker; chưa triển khai high availability.",
  "- Worker Up chỉ thể hiện tiến trình chạy, chưa có Docker healthcheck riêng.",
  "- Health Gateway kiểm tra các API và Redis, không thay thế kiểm tra Kafka/worker.",
  "- Sự kiện không hợp lệ có thể chặn consumer; chưa có dead-letter queue.",
  "- Lịch sử reservation trong Product có giới hạn; chưa có cơ chế lưu trữ dài hạn.",
  "- Bộ Postman dùng để demo thủ công; bài Node E2E thực hiện việc chờ bất đồng bộ.",
  "",
].join("\n");

fs.writeFileSync("README-MVP.md", readme);

fs.writeFileSync("docs/DEMO-CHECKLIST.md", [
  "# Checklist demo và bàn giao",
  "",
  "- [ ] Chọn đúng môi trường: 3002 hoặc 3003.",
  "- [ ] Chụp Docker Compose ps: API/database healthy, worker Up.",
  "- [ ] Health Gateway trả 200 và UP.",
  "- [ ] Đăng nhập ADMIN, STAFF, CUSTOMER.",
  "- [ ] ADMIN tạo membership score 100 và gán khách hàng.",
  "- [ ] ADMIN tạo sản phẩm; CUSTOMER bị chặn khi tạo sản phẩm.",
  "- [ ] Đọc sản phẩm hai lần, xem header X-Cache.",
  "- [ ] Đặt hàng và chờ CONFIRMED.",
  "- [ ] Kiểm tra subtotal, discount, total và chi tiết đơn.",
  "- [ ] Retry không tạo đơn mới; thay nội dung cùng requestId bị 409.",
  "- [ ] Tồn kho giảm đúng dù đã đọc qua cache.",
  "- [ ] Shipment được tạo từ sự kiện Kafka.",
  "- [ ] STAFF chuyển SHIPPING rồi DELIVERED.",
  "- [ ] CUSTOMER không được cập nhật trạng thái Shipment.",
  "- [ ] Lưu ảnh/log kết quả Node E2E và recovery đã chạy.",
  "- [ ] Không đưa .env, mật khẩu hoặc token vào tài liệu nộp.",
  "",
  "Request 14 có thể chưa đạt assertion khi Order còn PENDING.",
  "Request 18 có thể trả 404 trong lúc chờ consumer.",
  "Gửi lại sau vài giây; chỉ đi tiếp khi đúng trạng thái mong đợi.",
  "Nếu chờ quá 120 giây, kiểm tra log worker thay vì bỏ qua lỗi.",
  "",
  "Không đánh dấu checklist nếu chưa thực hiện hoặc chưa có bằng chứng.",
  "",
].join("\n"));

const parsed = JSON.parse(
  fs.readFileSync("docs/MSA-Prompt3.postman_collection.json", "utf8")
);

if (parsed.item.length !== 24) throw new Error("Unexpected request count");

for (const item of parsed.item) {
  for (const script of item.event || []) {
    new Function(script.script.exec.join("\n"));
  }
}

console.log("PASS: Postman JSON parses and contains 24 requests.");
console.log("PASS: Postman scripts have valid JavaScript syntax.");
console.log("Created: README-MVP.md");
console.log("Created: docs/MSA-Prompt3.postman_collection.json");
console.log("Created: docs/DEMO-CHECKLIST.md");
