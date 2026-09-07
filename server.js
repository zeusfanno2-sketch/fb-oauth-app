// ============================================================
//  ĐĂNG NHẬP BẰNG FACEBOOK (OAuth 2.0 - luồng Authorization Code)
//  Bộ code mẫu dành cho người không biết code.
//  KHÔNG cần sửa file này — mọi cấu hình nằm ở biến môi trường
//  (xem file .env.example và hướng dẫn HUONG-DAN-DEPLOY.md)
// ============================================================

require("dotenv").config();
const express = require("express");
const session = require("cookie-session");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1); // Render chạy phía sau proxy nên cần dòng này

// ---------------- Cấu hình (từ biến môi trường) ----------------
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // https://TEN-APP.onrender.com/auth/callback
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v23.0";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "VUI_LONG_DOI_CHUOI_BI_MAT_NAY_TRUOC_KHI_DEPLOY";
const PORT = process.env.PORT || 3000;

if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
  console.error("LỖI: Thiếu biến môi trường APP_ID / APP_SECRET / REDIRECT_URI. Xem .env.example");
  process.exit(1);
}

// ---------------- Phiên đăng nhập (cookie đã ký, không cần cơ sở dữ liệu) ----------------
app.use(
  session({
    name: "session",
    secret: SESSION_SECRET,
    maxAge: 7 * 24 * 60 * 60 * 1000, // hết hạn sau 7 ngày
    sameSite: "lax",
    httpOnly: true,
    // Render tự chuyển http -> https. Muốn an toàn tuyệt đối: đổi thành true
    // (khi đó chỉ hoạt động trên https, không test được ở máy local http)
    secure: false,
  })
);

// ---------------- URL của Facebook ----------------
const FB_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const FB_GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------------- Hàm phụ trợ ----------------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); padding: 32px; max-width: 440px; width: 100%; text-align: center; }
  h1 { font-size: 20px; color: #1c1e21; margin-bottom: 8px; }
  p { color: #606770; font-size: 14px; margin: 8px 0 20px; line-height: 1.5; word-break: break-word; }
  .avatar { width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 12px; background: #1877f2; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; }
  .btn { display: inline-block; text-decoration: none; background: #1877f2; color: #fff; font-weight: 600; padding: 12px 24px; border-radius: 8px; font-size: 15px; margin: 6px 4px; }
  .btn:hover { background: #166fe5; }
  .btn-ghost { background: #e4e6eb; color: #1c1e21; }
  .btn-ghost:hover { background: #d8dadf; }
  .muted { font-size: 12px; color: #8a8d91; margin-top: 16px; }
  .ok { color: #1a7f37; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
${bodyHtml}
</div>
</body>
</html>`;
}

function homeButton() {
  return `<p><a class="btn" href="/">← Về trang chủ</a></p>`;
}

// Đổi "code" lấy access_token (chỉ máy chủ gọi, có APP_SECRET)
async function exchangeCodeForToken(code) {
  const resp = await fetch(`${FB_GRAPH_URL}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    }).toString(),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    const msg = data.error ? data.error.message : `HTTP ${resp.status}`;
    throw new Error("Facebook từ chối đổi code lấy token: " + msg);
  }
  return data; // { access_token, token_type, expires_in }
}

// Lấy thông tin cơ bản của người dùng
async function fetchUserProfile(accessToken) {
  const url = `${FB_GRAPH_URL}/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) throw new Error("Không lấy được thông tin: " + data.error.message);
  return data; // { id, name, email }
}

// ============================================================
//  ROUTES
// ============================================================

// Trang chủ
app.get("/", (req, res) => {
  const u = req.session.user;
  if (u) {
    const initial = (u.name || "?").trim().charAt(0).toUpperCase() || "?";
    res.send(
      page(
        "Đăng nhập thành công",
        `<div class="avatar">${escapeHtml(initial)}</div>
         <h1>Xin chào ${escapeHtml(u.name)}! 👋</h1>
         <p class="ok">✔ Đăng nhập bằng Facebook thành công.</p>
         <p>Email: ${escapeHtml(u.email || "(Facebook không cung cấp email)")}<br>
            ID Facebook: ${escapeHtml(u.id)}</p>
         <p><a class="btn btn-ghost" href="/logout">Đăng xuất</a></p>
         <p class="muted">Bản demo — dữ liệu chỉ nằm trong cookie trình duyệt của bạn.</p>`
      )
    );
  } else {
    res.send(
      page(
        "Đăng nhập bằng Facebook",
        `<h1>Chào mừng 👋</h1>
         <p>Bấm nút bên dưới để đăng nhập bằng tài khoản Facebook của bạn.</p>
         <p><a class="btn" href="/login">Tiếp tục với Facebook</a></p>
         <p class="muted">Bản demo lấy tên + email để xác thực. Không đăng bài, không đọc tin nhắn.</p>`
      )
    );
  }
});

// Bắt đầu đăng nhập: tạo state chống giả mạo rồi đưa người dùng sang Facebook
app.get("/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_engagement",
    ].join(","),
    response_type: "code",
  });
  res.redirect(`${FB_DIALOG_URL}?${params.toString()}`);
});

// Facebook quay về đây sau khi người dùng đồng ý / từ chối
app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Người dùng bấm "Không phải bây giờ" / Facebook báo lỗi
    if (error) {
      return res
        .status(400)
        .send(
          page(
            "Đăng nhập thất bại",
            `<h1>😕 Chưa đăng nhập được</h1>
             <p>Facebook báo: <b>${escapeHtml(error_description || error)}</b></p>
             <p>${homeButton()}</p>
             <p><a class="btn" href="/login">Thử lại</a></p>`
          )
        );
    }

    // Thiếu mã xác nhận
    if (!code) {
      return res
        .status(400)
        .send(
          page(
            "Lỗi",
            `<h1>⚠️ Thiếu mã xác nhận</h1>
             <p>Facebook không trả về mã <code>code</code>. Có thể bạn mở sai đường dẫn.</p>
             ${homeButton()}`
          )
        );
    }

    // Kiểm tra state (chống giả mạo / làm mới trang cũ)
    if (!req.session.oauthState || req.session.oauthState !== state) {
      return res
        .status(400)
        .send(
          page(
            "Lỗi bảo mật",
            `<h1>🔒 Yêu cầu không hợp lệ</h1>
             <p>Mã kiểm tra <code>state</code> không khớp — thường do bạn làm mới một trang cũ.
             Bấm nút bên dưới để đăng nhập lại từ đầu.</p>
             <p><a class="btn" href="/login">Đăng nhập lại</a></p>`
          )
        );
    }
    req.session.oauthState = null;

    // Đổi code lấy token, rồi lấy thông tin người dùng
    const tokenData = await exchangeCodeForToken(code);
    const profile = await fetchUserProfile(tokenData.access_token);

    // Lưu phiên đăng nhập
    req.session.user = {
      id: profile.id,
      name: profile.name,
      email: profile.email || "",
      token: tokenData.access_token,
    };

    res.redirect("/");
  } catch (err) {
    console.error("Lỗi xử lý callback:", err.message);
    res
      .status(500)
      .send(
        page(
          "Lỗi máy chủ",
          `<h1>💥 Có lỗi xảy ra</h1>
           <p>${escapeHtml(err.message)}</p>
           ${homeButton()}`
        )
      );
  }
});

// Đăng xuất
app.get("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`✅ Ứng dụng đang chạy tại http://localhost:${PORT}`);
  console.log(`   Redirect URI phải khớp: ${REDIRECT_URI}`);
});
