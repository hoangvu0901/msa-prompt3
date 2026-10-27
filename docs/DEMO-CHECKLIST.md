# Checklist demo và bàn giao

- [ ] Chọn đúng môi trường: 3002 hoặc 3003.
- [ ] Chụp Docker Compose ps: API/database healthy, worker Up.
- [ ] Health Gateway trả 200 và UP.
- [ ] Đăng nhập ADMIN, STAFF, CUSTOMER.
- [ ] ADMIN tạo membership score 100 và gán khách hàng.
- [ ] ADMIN tạo sản phẩm; CUSTOMER bị chặn khi tạo sản phẩm.
- [ ] Đọc sản phẩm hai lần, xem header X-Cache.
- [ ] Đặt hàng và chờ CONFIRMED.
- [ ] Kiểm tra subtotal, discount, total và chi tiết đơn.
- [ ] Retry không tạo đơn mới; thay nội dung cùng requestId bị 409.
- [ ] Tồn kho giảm đúng dù đã đọc qua cache.
- [ ] Shipment được tạo từ sự kiện Kafka.
- [ ] STAFF chuyển SHIPPING rồi DELIVERED.
- [ ] CUSTOMER không được cập nhật trạng thái Shipment.
- [ ] Lưu ảnh/log kết quả Node E2E và recovery đã chạy.
- [ ] Không đưa .env, mật khẩu hoặc token vào tài liệu nộp.

Request 14 có thể chưa đạt assertion khi Order còn PENDING.
Request 18 có thể trả 404 trong lúc chờ consumer.
Gửi lại sau vài giây; chỉ đi tiếp khi đúng trạng thái mong đợi.
Nếu chờ quá 120 giây, kiểm tra log worker thay vì bỏ qua lỗi.

Không đánh dấu checklist nếu chưa thực hiện hoặc chưa có bằng chứng.
