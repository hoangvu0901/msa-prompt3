# Ecommerce MVP - Microservices

Backend Node.js theo Microservices, DDD và Database-per-Service.

## Kiến trúc

| Thành phần | Trách nhiệm | Lưu trữ / cổng nội bộ |
|---|---|---|
| API Gateway | REST routing, JWT, phân quyền, rate limit, logging, cache | Redis / 3002 |
| Auth | Đăng ký, đăng nhập, role | PostgreSQL / gRPC 50051 |
| Customer | Hồ sơ, hạng thành viên, score | PostgreSQL / gRPC 50052 |
| Product | Sản phẩm, tồn kho, reservation | MongoDB / gRPC 50053 |
| Order | Đơn hàng, chi tiết, discount, outbox | PostgreSQL / gRPC 50054 |
| Shipment | Tiếp nhận đơn hàng, trạng thái giao hàng | MongoDB / gRPC 50055 |

Mỗi service quản lý database của mình; không truy cập bảng của service khác.
Các lớp mã nguồn: domain, application, infrastructure, interfaces.

Order worker xử lý đơn và tồn kho. Outbox worker phát OrderCreated lên Kafka.
Shipment consumer tiếp nhận sự kiện và tạo shipment chống trùng.
Sự kiện có thể được giao lại; consumer xử lý idempotent.

## Quy tắc MVP

- Score là điểm của hạng thành viên.
- Score 0–99: giảm 0%; 100–499: giảm 5%; từ 500: giảm 10%.
- Đây là chính sách discount dùng cho bài thực hành.
- Giá, score và số tiền được chụp lại khi xử lý đơn.
- Một order tạo một shipment trong phạm vi MVP.
- Shipment: PENDING -> SHIPPING -> DELIVERED.
- CUSTOMER đặt hàng; ADMIN quản trị; SHIPMENT_STAFF cập nhật giao hàng.
- Retry cùng khách hàng và requestId không tạo đơn mới.
- Cùng requestId nhưng nội dung khác bị từ chối.
- Order API trả 202 khi xử lý chưa hoàn tất; client đọc lại trạng thái.

## Chuẩn bị

- Docker Desktop chạy Linux containers, Docker Compose hỗ trợ !override.
- Node.js 24 để chạy script kiểm thử trên máy.
- Git Bash trên Windows cho các lệnh shell.
- File .env chứa các biến được yêu cầu trong compose.yaml.
- Không đưa .env, mật khẩu hoặc JWT lên Git.

Các biến trong .env:

AUTH_DB_PASSWORD, CUSTOMER_DB_PASSWORD, ORDER_DB_PASSWORD,
PRODUCT_MONGO_USER, PRODUCT_MONGO_PASSWORD, PRODUCT_APP_PASSWORD,
SHIPMENT_MONGO_USER, SHIPMENT_MONGO_PASSWORD, SHIPMENT_APP_PASSWORD, JWT_SECRET.

Tạo .env.admin.local với BOOTSTRAP_ADMIN_USERNAME,
BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD.
Tạo .env.shipment-staff.local với BOOTSTRAP_STAFF_USERNAME,
BOOTSTRAP_STAFF_EMAIL, BOOTSTRAP_STAFF_PASSWORD.
Dùng cú pháp KEY='value' để có thể source bằng Git Bash.

## Cài mới trong môi trường kiểm tra

Chạy từ thư mục gốc:

```bash
bash infrastructure/test-clean-start.sh
```

Script dùng project msa-prompt3-clean, volume riêng và Gateway cổng 3003.
Script từ chối chạy khi project này đã có volume; không dùng nó để restart.
Thứ tự: database -> SQL/migrations -> Mongo app users/indexes -> topic -> services.

Nạp tài khoản và tạo ADMIN/STAFF:

```bash
set -a
source .env.admin.local
source .env.shipment-staff.local
set +a

dc() {
  docker compose -p msa-prompt3-clean -f compose.yaml -f compose.clean.yaml "$@"
}

dc exec -T -e BOOTSTRAP_ADMIN_USERNAME -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD auth-service node src/seed-admin.js
dc exec -T -e BOOTSTRAP_STAFF_USERNAME -e BOOTSTRAP_STAFF_EMAIL -e BOOTSTRAP_STAFF_PASSWORD auth-service node src/seed-shipment-staff.js
```

## Khởi động lại và dừng

Môi trường kiểm tra đã được khởi tạo:

```bash
docker compose -p msa-prompt3-clean -f compose.yaml -f compose.clean.yaml up -d --wait --wait-timeout 240
docker compose -p msa-prompt3-clean -f compose.yaml -f compose.clean.yaml stop
```

Môi trường thực hành cũ đã được khởi tạo: docker compose up -d --wait.
Gateway môi trường cũ: http://127.0.0.1:3002.
Gateway môi trường kiểm tra: http://127.0.0.1:3003.

## Kiểm thử

Sau khi nạp các biến ADMIN/STAFF:

```bash
TEST_API_BASE=http://127.0.0.1:3003 node.exe services/order/src/test-e2e-rest.js
```

Kết quả mong đợi: ALL REST E2E CHECKS PASSED.
E2E tạo dữ liệu mới cho mỗi lần chạy.
Kết quả E2E: subtotal 600000.00, discount 30000.00, total 570000.00.

Import docs/MSA-Prompt3.postman_collection.json để demo thủ công.
Điền tài khoản trong Variables; gửi request theo thứ tự.
Đợi Order CONFIRMED và Shipment được tạo trước khi cập nhật giao hàng.
Postman demo dùng một sản phẩm: subtotal 300000.00, total 285000.00.

## Giới hạn

- Cấu hình local một Kafka broker; chưa triển khai high availability.
- Worker Up chỉ thể hiện tiến trình chạy, chưa có Docker healthcheck riêng.
- Health Gateway kiểm tra các API và Redis, không thay thế kiểm tra Kafka/worker.
- Sự kiện không hợp lệ có thể chặn consumer; chưa có dead-letter queue.
- Lịch sử reservation trong Product có giới hạn; chưa có cơ chế lưu trữ dài hạn.
- Bộ Postman dùng để demo thủ công; bài Node E2E thực hiện việc chờ bất đồng bộ.
