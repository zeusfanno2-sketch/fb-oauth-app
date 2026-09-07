# Đăng nhập bằng Facebook — Bộ code mẫu (0 đồng, không cần domain)

Ứng dụng web nhỏ cho phép người dùng **đăng nhập bằng tài khoản Facebook**
(luồng OAuth 2.0 Authorization Code chuẩn). Code đã viết sẵn — bạn **không cần biết lập trình**,
chỉ cần làm theo từng bước trong [HUONG-DAN-DEPLOY.md](HUONG-DAN-DEPLOY.md).

## Cấu trúc

| File / thư mục | Vai trò |
|---|---|
| `server.js` | Toàn bộ ứng dụng (Express). Không cần sửa. |
| `package.json` | Danh sách thư viện cần cài. Không cần sửa. |
| `.env.example` | Mẫu cấu hình. Chạy máy tính thì copy thành `.env` để điền giá trị. |
| `docs/privacy.html` | Chính sách quyền riêng tư — sửa tên app + email của bạn. |
| `docs/data-deletion.html` | Hướng dẫn xóa dữ liệu — sửa tên app + email của bạn. |
| `HUONG-DAN-DEPLOY.md` | **Hướng dẫn từng nút bấm để đưa lên Internet (bắt buộc đọc).** |

## Kiến trúc (hiểu nôm na)

```
Trình duyệt người dùng ──bấm "Tiếp tục với Facebook"──▶ Facebook (hỏi đồng ý)
        ▲                                                        │ đồng ý
        │                                        Facebook quay về callback URL
        └──────────── server.js đổi code lấy token ──────────────┘
                     (APP_SECRET chỉ nằm ở máy chủ, không lộ ra ngoài)
```

- **Nơi chạy code (máy chủ):** Render bản Free → `https://TEN-APP.onrender.com`
- **Nơi chứa code:** GitHub (kho chứa, không phải nơi chạy)
- **2 trang chính sách:** GitHub Pages (để Facebook kiểm tra được)

## Chạy thử ở máy tính (tùy chọn, cần cài Node.js)

```bash
npm install
# copy .env.example thành .env rồi điền APP_ID, APP_SECRET, REDIRECT_URI
npm start
# mở http://localhost:3000
```

## ⚠️ 3 nguyên tắc bất biến (làm sai là hỏng)

1. **Không bao giờ** đẩy `App Secret` hoặc file `.env` lên GitHub (`.gitignore` đã chặn sẵn).
2. Địa chỉ **Redirect URI** trong Facebook phải khớp **từng ký tự** với `REDIRECT_URI` trong cấu hình.
3. Muốn người ngoài (không phải quản trị app) đăng nhập được, app Facebook phải ở chế độ **Live**.

> Chi tiết đầy đủ: xem [HUONG-DAN-DEPLOY.md](HUONG-DAN-DEPLOY.md) — làm lần lượt từ Phần 1 đến Phần 7.
