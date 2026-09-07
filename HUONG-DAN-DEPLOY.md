# HƯỚNG DẪN TỪNG NÚT BẤM — Đưa "Đăng nhập bằng Facebook" lên Internet

> Dành cho người **không biết lập trình**. Làm **lần lượt từ Phần 1 đến Phần 7**,
> không bỏ qua bước nào. Tổng thời gian ~30–45 phút, **chi phí 0 đồng**.
> Nếu một màn hình không giống hệt mô tả (Facebook/Render hay đổi giao diện),
> hãy tìm chỗ có **cùng ý nghĩa** với chữ in đậm — đừng bỏ cuộc.

---

## Cần chuẩn bị trước

| Thứ | Dùng để | Bạn có sẵn chưa |
|---|---|---|
| 1 tài khoản **Gmail/email** | Đăng ký GitHub, Render | ☐ |
| 1 tài khoản **GitHub** | Chứa code (miễn phí) | ☐ |
| 1 tài khoản **Facebook cá nhân** | Tạo "App" Facebook (bắt buộc có số điện thoại/email xác minh) | ☐ |
| 1 tài khoản **Facebook khác** (của bạn bè/người thân) | Kiểm tra đăng nhập với tư cách người ngoài | ☐ |

> Mẹo: nên dùng trình duyệt có đăng nhập sẵn GitHub để không phải gõ mật khẩu nhiều lần.

---

# PHẦN 1 — Đưa code lên GitHub (kho chứa code)

### Bước 1.1 — Tạo kho chứa (repository)
1. Mở `https://github.com` → bấm dấu **+** (góc trên bên phải) → chọn **New repository**.
2. Đặt tên: `fb-oauth-app` (viết thường, không dấu, không khoảng trắng).
3. Chọn **Private** (riêng tư — an toàn hơn) hoặc **Public** đều được.
4. **KHÔNG** tick "Add a README file" (trong bộ code đã có README).
5. Bấm nút xanh **Create repository**.

### Bước 1.2 — Tải bộ code về máy và giải nén
- Nếu nhận file `.zip`: giải nén ra một thư mục, ví dụ `fb-oauth-app`.
- Kiểm tra bên trong có các file: `server.js`, `package.json`, `README.md`, thư mục `docs`, `.env.example`.

### Bước 1.3 — Upload code lên GitHub (không cần dùng lệnh)
1. Trên trang repository vừa tạo (đang trống), bấm **uploading an existing file**.
2. Kéo toàn bộ các file **và thư mục `docs`** vào khung upload
   (kéo nguyên thư mục `docs` để giữ file chính sách bên trong).
3. Cuộn xuống bấm **Commit changes** → chờ vài giây → thấy danh sách file hiện ra là xong.
   > Lưu ý: GitHub bỏ qua file bắt đầu bằng dấu chấm khi kéo thả, nên bước sau phải làm thủ công.

### Bước 1.4 — Tạo file `.gitignore` bằng tay (quan trọng, chống lộ bí mật)
1. Trong repository, bấm **Add file** → **Create new file**.
2. Ô đặt tên file, gõ chính xác: `.gitignore`
3. Dán nội dung bên dưới vào ô lớn:
```
node_modules/
.env
*.log
.DS_Store
```
4. Bấm **Commit changes**.
   > File này bảo GitHub **không bao giờ** nhận file `.env` chứa mật khẩu của bạn.

✅ **Hết Phần 1.** Kết quả: repository `fb-oauth-app` có đủ file, không có `.env`.

---

# PHẦN 2 — Tạo App trên Facebook (lấy App ID + App Secret)

### Bước 2.1 — Vào trang nhà phát triển
1. Mở `https://developers.facebook.com` bằng tài khoản Facebook cá nhân.
2. Bấm **Get Started** / **Bắt đầu** nếu được hỏi → xác nhận bằng mật khẩu Facebook.
   (Facebook có thể yêu cầu thêm số điện thoại — làm theo hướng dẫn của Facebook.)

### Bước 2.2 — Tạo ứng dụng
1. Góc trên bên phải: bấm **My Apps** → **Create App**.
2. Màn hình "Use case": chọn **Authenticate and request data from users with Facebook Login** → **Next**.
3. Chọn loại app: **Consumer** → **Next**.
4. Đặt tên app (hiển thị cho người dùng, ví dụ "Đăng nhập nhanh 2026"), điền email liên hệ → **Create App**.
   > Mỗi tài khoản Facebook thường có **giới hạn số app tạo được trong ngày** — tạo 1 app là đủ.

### Bước 2.3 — Lấy App ID và App Secret
1. Vào **App Dashboard** của app vừa tạo → menu trái **Settings** → **Basic**.
2. Nhìn thấy **App ID** (dãy số dài) và mục **App Secret** (cần bấm **Show** + nhập mật khẩu Facebook để xem).
3. **Ghi 2 giá trị này ra chỗ an toàn** (ví dụ file ghi chú riêng) — sẽ dùng ở Phần 3.
   > ⛔ App Secret là **chìa khóa** — chỉ được dán vào Render (Phần 3), **không bao giờ** dán vào code, vào GitHub, vào chat, vào email.

✅ **Hết Phần 2.** Kết quả: có `APP_ID` (số) và `APP_SECRET` (chuỗi chữ số).

---

# PHẦN 3 — Đưa ứng dụng lên Render (máy chủ miễn phí)

### Bước 3.1 — Đăng ký Render
1. Mở `https://render.com` → bấm **Get Started** → chọn **GitHub** để đăng ký (đăng nhập GitHub là xong, không cần thẻ ngân hàng).
2. Khi Render hỏi quyền truy cập GitHub, bấm **Authorize** (cho phép đọc repository của bạn).

### Bước 3.2 — Tạo Web Service từ repository
1. Bấm **New +** (góc trên) → chọn **Web Service**.
2. Nếu chưa liên kết: bấm **Connect account** → chọn repository `fb-oauth-app` → **Connect**.
3. Render tự đọc được `package.json`. Điền / kiểm tra:
   - **Name:** để mặc định hoặc đặt `fb-oauth-app`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** chọn **Free** ($0)
4. Bấm **Create Web Service**.

### Bước 3.3 — Điền bí mật (Environment Variables)
1. Sau khi tạo, vào tab **Environment** của service.
2. Bấm **Add Environment Variable**, thêm **3 biến**:

| Key (tên biến) | Value (giá trị — lấy từ đâu) |
|---|---|
| `APP_ID` | App ID ở Phần 2.3 |
| `APP_SECRET` | App Secret ở Phần 2.3 |
| `REDIRECT_URI` | `https://fb-oauth-app.onrender.com/auth/callback` — **chưa bấm deploy đừng vội**; xem mẹo dưới |

   > **Mẹo lấy đúng REDIRECT_URI:** sau khi bấm Create Web Service, Render tự deploy lần đầu
   > và hiện địa chỉ dạng `https://<tên-random>.onrender.com`. Mở địa chỉ đó lên,
   > **copy chính xác từ thanh địa chỉ**, rồi thêm đuôi `/auth/callback` vào cuối
   > → dán làm giá trị `REDIRECT_URI`. (Ví dụ `https://fb-oauth-app-abc123.onrender.com/auth/callback`.)
   > Lưu ý: **bỏ dấu `/` cuối cùng**, phải bắt đầu bằng `https://`.
3. (Khuyên dùng) thêm biến thứ 4: Key `SESSION_SECRET`, Value = một chuỗi dài tự nghĩ, ví dụ `mat-khau-dang-nhap-cua-toi-2026-rat-bi-mat`.
4. Render tự deploy lại khi bạn thêm biến. Vào tab **Events** xem chữ **deploy successful** (xanh) là máy chủ đã chạy.
   > Mẹo: bản Free của Render **ngủ sau 15 phút không ai truy cập**, thức dậy lại mất ~1 phút
   > (trình duyệt hiện trang chờ). Điều này bình thường. Cách chống ngủ: Phần 7.

### Bước 3.4 — Kiểm tra máy chủ đang chạy
1. Mở `https://<tên>.onrender.com` → phải thấy trang **"Chào mừng 👋"** với nút **"Tiếp tục với Facebook"**.
2. Chưa thấy? Vào tab **Logs** đọc dòng lỗi cuối, hoặc kiểm tra lại 3 biến ở Bước 3.3.

✅ **Hết Phần 3.** Kết quả: mở URL `.onrender.com` thấy trang đăng nhập (có https ở đầu).

---

# PHẦN 4 — Bật GitHub Pages cho 2 trang chính sách

Facebook yêu cầu app có **Chính sách quyền riêng tư** ở một địa chỉ web công khai. Ta dùng GitHub Pages (miễn phí).

### Bước 4.1 — Sửa tên + email trong 2 file chính sách (bắt buộc)
1. Mở repository `fb-oauth-app` trên GitHub → vào thư mục `docs` → mở `privacy.html` → bấm **pencil ✏️** (sửa).
2. Thay:
   - `[TÊN APP]` → tên ứng dụng của bạn (giống tên app Facebook ở Phần 2)
   - `[EMAIL LIÊN HỆ]` → email của bạn
   - `[NGÀY]` → ngày hôm nay
3. Bấm **Commit changes**.
4. Làm **y hệt** với file `data-deletion.html`.

### Bước 4.2 — Bật Pages
1. Trong repository: **Settings** (tab cuối cùng) → menu trái **Pages**.
2. Mục **Build and deployment** → **Source**: chọn **Deploy from a branch**.
3. **Branch**: chọn `main` → thư mục bên cạnh chọn **`/docs`** → bấm **Save**.
4. Chờ 1–3 phút, refresh lại trang → thấy dòng "Your site is live at..." kèm địa chỉ.
5. Ghi lại **2 địa chỉ** (thay `TEN-NGUOI-DUNG` bằng tên tài khoản GitHub của bạn):
   - `https://TEN-NGUOI-DUNG.github.io/fb-oauth-app/privacy.html`
   - `https://TEN-NGUOI-DUNG.github.io/fb-oauth-app/data-deletion.html`

✅ **Hết Phần 4.** Kết quả: mở 2 địa chỉ trên thấy trang chính sách đẹp đẽ.

---

# PHẦN 5 — Nối Facebook App với ứng dụng của bạn

### Bước 5.1 — Chuyển app sang chế độ Live
1. Mở `https://developers.facebook.com` → **My Apps** → mở app của bạn.
2. Góc trên: chế độ đang là **Development** → bấm chuyển sang **Live** (có thể phải nhập mật khẩu Facebook).
   > App ở chế độ Development chỉ người làm app dùng thử được — người ngoài sẽ bị chặn.

### Bước 5.2 — Thêm sản phẩm Facebook Login
1. Menu trái của App Dashboard → tìm mục **Add products** (Thêm sản phẩm).
2. Tìm **Facebook Login** → bấm **Set up** (Thiết lập) → có thể bấm **Skip** ở các bước hỏi thêm.

### Bước 5.3 — Khai báo Redirect URI
1. Menu trái: **Facebook Login** → **Settings** (Cài đặt).
2. Tìm ô **Valid OAuth Redirect URIs** → dán địa chỉ chính xác:
   `https://<tên>.onrender.com/auth/callback`
   (giống hệt giá trị `REDIRECT_URI` ở Phần 3.3 — **từng ký tự**)
3. Bấm **Save Changes**.

### Bước 5.4 — Khai báo Chính sách quyền riêng tư
1. Menu trái: **Settings** → **Basic**.
2. Tìm ô **Privacy Policy URL** → dán địa chỉ `.../fb-oauth-app/privacy.html` (Phần 4).
3. Bấm **Save Changes**.
   > Nếu thấy ô **Data Deletion Request URL** (hoặc Facebook gửi thông báo yêu cầu):
   > dán địa chỉ `.../fb-oauth-app/data-deletion.html` vào. Nếu chưa thấy ô này thì bỏ qua — để dành khi Facebook hỏi.

✅ **Hết Phần 5.** Kết quả: app Live, có Facebook Login, Redirect URI + Privacy Policy đã khai báo.

---

# PHẦN 6 — Kiểm tra lần cuối (test thật)

### Bước 6.1 — Test bằng chính tài khoản của bạn
1. Mở `https://<tên>.onrender.com` → bấm **Tiếp tục với Facebook**.
2. Facebook hỏi đồng ý → bấm **Continue as ...** (Tiếp tục).
3. Thấy màn hình **"Xin chào [tên của bạn]!"** kèm email → ✅ thành công.
4. Bấm **Đăng xuất** để test lại lần nữa.

### Bước 6.2 — Test bằng tài khoản NGƯỜI KHÁC (bước quan trọng nhất)
1. Mở trình duyệt khác / chế độ ẩn danh → đăng nhập Facebook bằng tài khoản **thứ hai** (người ngoài app).
2. Mở URL app → bấm **Tiếp tục với Facebook** → đồng ý.
3. **Thấy "Xin chào"** → 🎉 xong: app hoạt động cho công chúng.
4. **Bị báo lỗi kiểu "app chưa được phê duyệt / not accessible"** → tài khoản ngoài chưa được phép:
   - Vào App Dashboard → **App Review** → xem mục yêu cầu quyền `public_profile`/`email`
     → bấm **Submit for Review** (điền mô tả + video demo ngắn; Facebook duyệt vài ngày),
     hoặc chạy thử với người được thêm làm **tester** trong app (mục **Roles**).

✅ **Hết Phần 6.** Kết quả: 1 tài khoản ngoài đăng nhập thành công = dự án HOÀN THÀNH.

---

# PHẦN 7 — Chống Render ngủ + lưu ý quan trọng

### Chống ngủ (khuyên dùng khi đã có người dùng thật)
1. Đăng ký `https://uptimerobot.com` (miễn phí) → **Add New Monitor**.
2. Type: **HTTP(S)** → URL: `https://<tên>.onrender.com` → Interval: **10 minutes** → Create.
   → Cứ 10 phút có 1 lượt truy cập "gõ cửa", Render không ngủ, người dùng vào không phải chờ.

### 3 lưu ý sống còn
1. **App Secret chỉ ở Render** (Environment Variables). Nếu lỡ dán vào code/GitHub → vào
   App Dashboard → Settings → Basic → **Reset App Secret** để tạo cái mới ngay.
2. Muốn **sửa gì trong code**: sửa trên GitHub → Render **tự động deploy lại** trong ~1 phút. Không cần làm gì thêm.
3. Bản demo này lưu phiên đăng nhập trong **cookie trình duyệt** (không cần cơ sở dữ liệu) — phù hợp xác thực + hiển thị thông tin. Khi làm sản phẩm lớn hơn (lưu dữ liệu người dùng lâu dài), cần thêm cơ sở dữ liệu — đó là lúc nhờ người biết code.

---

## Gặp lỗi? Tra bảng này

| Hiện tượng | Nguyên nhân hay gặp | Cách sửa |
|---|---|---|
| Sau khi bấm nút Facebook, URL lỗi có chữ `redirect_uri` | Redirect URI không khớp | So lại Bước 5.3 với Phần 3.3, khớp **từng ký tự**, không dư dấu `/` |
| Lỗi "In Development mode" / "app unavailable" | App chưa chuyển Live | Bước 5.1 |
| Trang onrender tải lâu hoặc hiện trang chờ | Render đang "ngủ" | Đợi ~1 phút nó tự thức; lâu dài dùng UptimeRobot (Phần 7) |
| Lỗi version trong URL facebook | Phiên bản Graph API cũ | Thêm biến `GRAPH_VERSION` (ví dụ `v23.0`, `v24.0`, `v25.0`) vào Environment → Render tự deploy lại |
| Ứng dụng không tự deploy khi sửa code | Quên commit trên GitHub | Commit + đẩy lên GitHub; xem tab Events của Render |
