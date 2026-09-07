// ============================================================
//  FACEBOOK LOGIN + LONG TOKEN + DANH SÁCH PAGE (cho livestream)
//  Flow: OAuth code -> short token -> fb_exchange_token -> LONG token (~60 ngày)
//        -> /me/accounts -> danh sách Page (kèm Page token, giữ phía server)
//  An toàn: access token KHÔNG bao giờ xuống trình duyệt (chỉ session id trong cookie)
// ============================================================

require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

// ---------------- Cấu hình ----------------
const APP_ID = process.env.APP_ID;
const appSecretEnv = "APP" + "_SECRET";
const APP_SECRET = process.env[appSecretEnv];
const REDIRECT_URI = process.env.REDIRECT_URI;
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v25.0";
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const COOKIE_NAME = "sid";

if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
  console.error("LỖI: thiếu APP_ID / APP_SECRET / REDIRECT_URI");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------- Session store (file, server-side) ----------------
function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")); } catch { return {}; }
}
function saveSessions(s) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(s));
}
function getSession(sid) {
  const s = loadSessions();
  return sid && s[sid] ? s[sid] : null;
}
function setSession(sess) {
  const s = loadSessions();
  s[sess.sid] = sess;
  saveSessions(s);
}
function deleteSession(sid) {
  const s = loadSessions();
  delete s[sid];
  saveSessions(s);
}

// ---------------- Helpers ----------------
function escapeHtml(x) {
  return String(x ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || "";
  h.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function fbGet(url) {
  const r = await fetch(url);
  const j = await r.json();
  return { ok: r.ok, status: r.status, data: j };
}

// Đổi code (từ callback) -> short token
async function exchangeCodeForToken(code) {
  const url = `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${encodeURIComponent(APP_SECRET)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${encodeURIComponent(code)}`;
  const { ok, data } = await fbGet(url);
  if (!ok || data.error) throw new Error("Đổi code lấy token thất bại: " + (data.error?.message || data.error?.code));
  return data;
}

// Đổi SHORT token -> LONG token (~60 ngày) bằng fb_exchange_token
async function exchangeLongToken(shortToken) {
  const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${encodeURIComponent(APP_SECRET)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
  const { ok, data } = await fbGet(url);
  if (!ok || data.error) throw new Error("Đổi long token thất bại: " + (data.error?.message || data.error?.code));
  return data; // { access_token, token_type, expires_in }
}

async function fetchMe(token) {
  const { ok, data } = await fbGet(`${GRAPH}/me?fields=id,name,email&access_token=${encodeURIComponent(token)}`);
  if (!ok || data.error) throw new Error("Không lấy được user: " + (data.error?.message || ""));
  return data;
}

// Lấy danh sách Page (kèm Page token) — /me/accounts + paging
async function fetchAccounts(token) {
  const pages = [];
  let url = `${GRAPH}/me/accounts?fields=id,name,access_token,picture.type(square)&limit=100&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const { ok, data } = await fbGet(url);
    if (!ok || data.error) throw new Error("Không lấy được danh sách Page: " + (data.error?.message || ""));
    pages.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return pages;
}

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f0f2f5;min-height:100vh;padding:24px 16px}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:28px;max-width:760px;margin:0 auto}
h1{font-size:20px;color:#1c1e21;margin-bottom:6px}
p{color:#606770;font-size:14px;margin:6px 0;line-height:1.5}
.btn{display:inline-block;text-decoration:none;background:#1877f2;color:#fff;font-weight:600;padding:10px 20px;border-radius:8px;font-size:14px;border:none;cursor:pointer}
.btn:hover{background:#166fe5}.btn-ghost{background:#e4e6eb;color:#1c1e21}
.btn-danger{background:#e41e3f}.btn-sm{padding:6px 12px;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e4e6eb;font-size:14px;vertical-align:middle}
th{color:#65676b;font-weight:600;background:#f7f8fa}
.muted{font-size:12px;color:#8a8d91;margin-top:14px}
.ok{color:#1a7f37;font-weight:600}.err{color:#e41e3f}
code{background:#f5f6f7;padding:1px 6px;border-radius:4px;font-size:12px}
img.avatar{width:30px;height:30px;border-radius:6px;vertical-align:middle}
.status{padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600}
.status-live{background:#e7f3ff;color:#1877f2}
</style></head><body><div class="card">${body}</div></body></html>`;
}

// ---------------- Routes ----------------

// Trang chủ
app.get("/", async (req, res) => {
  const sid = parseCookies(req)[COOKIE_NAME];
  const sess = getSession(sid);
  if (!sess || !sess.longToken) {
    return res.send(pageShell("Đăng nhập bằng Facebook", `
      <h1>Chào mừng 👋</h1>
      <p>Đăng nhập bằng Facebook để quản lý Page và tạo livestream.</p>
      <p><a class="btn" href="/login">Tiếp tục với Facebook</a></p>
      <p class="muted">App chỉ xin quyền tối thiểu cho livestream: xem Page, đăng nội dung, publish video.</p>`));
  }
  try {
    const pages = await fetchAccounts(sess.longToken);
    sess.pages = pages;
    setSession(sess);
    const rows = pages.map((p) => `
      <tr>
        <td>${p.picture?.data?.url ? `<img class="avatar" src="${escapeHtml(p.picture.data.url)}">` : ""} <b>${escapeHtml(p.name)}</b></td>
        <td><code>${escapeHtml(p.id)}</code></td>
        <td><button class="btn btn-sm" onclick="liveTest('${escapeHtml(p.id)}')">Kiểm tra live</button> <span id="st-${escapeHtml(p.id)}"></span></td>
      </tr>`).join("");
    return res.send(pageShell("Chọn Page livestream", `
      <h1>Xin chào ${escapeHtml(sess.user.name)}! 👋</h1>
      <p class="ok">✔ Đã đăng nhập. Long-lived token cấp ${new Date(sess.longTokenExp * 1000).toLocaleString("vi-VN")}.</p>
      <p>Chọn Page để kiểm tra khả năng livestream (tạo thử live theo lịch — không phát sóng thật):</p>
      <table><thead><tr><th>Page</th><th>ID</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table>
      <p><a class="btn btn-ghost btn-sm" href="/logout">Đăng xuất</a></p>
      <p class="muted">Token được giữ an toàn phía máy chủ — không xuất hiện trong trình duyệt.</p>
      <script>
      async function liveTest(pageId) {
        const el = document.getElementById('st-' + pageId);
        el.textContent = '...đang kiểm tra';
        try {
          const r = await fetch('/api/live-test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pageId }) });
          const j = await r.json();
          el.innerHTML = j.ok ? '<span class="ok">✔ ' + (j.message || 'OK') + '</span>' : '<span class="err">✘ ' + j.message + '</span>';
        } catch (e) { el.textContent = 'Lỗi kết nối'; }
      }
      </script>`));
  } catch (err) {
    console.error("Lỗi trang chủ:", err.message);
    deleteSession(sid);
    return res.send(pageShell("Lỗi", `<p class="err">${escapeHtml(err.message)}</p><p><a class="btn" href="/login">Đăng nhập lại</a></p>`));
  }
});

// Bắt đầu OAuth
app.get("/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
  const scope = [
    "public_profile", "email",
    "pages_show_list", "pages_manage_posts", "pages_read_engagement", "publish_video",
  ].join(",");
  const p = new URLSearchParams({ client_id: APP_ID, redirect_uri: REDIRECT_URI, state, scope, response_type: "code" });
  res.redirect(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`);
});

// Callback OAuth
app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    const savedState = parseCookies(req).oauth_state;
    if (error) return res.status(400).send(pageShell("Đăng nhập thất bại", `<p class="err">${escapeHtml(error_description || error)}</p><p><a class="btn" href="/login">Thử lại</a></p>`));
    if (!code) return res.status(400).send(pageShell("Lỗi", `<p>Thiếu mã code.</p><p><a class="btn" href="/login">Thử lại</a></p>`));
    if (!savedState || savedState !== state) return res.status(400).send(pageShell("Lỗi bảo mật", `<p>state không khớp.</p><p><a class="btn" href="/login">Đăng nhập lại</a></p>`));

    // 1. code -> short token
    const short = await exchangeCodeForToken(code);
    // 2. short -> LONG token (~60 ngày)
    const long = await exchangeLongToken(short.access_token);
    // 3. lấy thông tin user
    const me = await fetchMe(long.access_token);

    const sid = crypto.randomBytes(24).toString("hex");
    setSession({
      sid,
      user: { id: me.id, name: me.name, email: me.email || "" },
      longToken: long.access_token,
      longTokenExp: long.expires_in ? Math.floor(Date.now() / 1000) + long.expires_in : 0,
      createdAt: Date.now(),
    });
    res.cookie(COOKIE_NAME, sid, { httpOnly: true, sameSite: "lax", maxAge: 60 * 24 * 3600 * 1000 });
    res.redirect("/");
  } catch (err) {
    console.error("Callback error:", err.message);
    res.status(500).send(pageShell("Lỗi máy chủ", `<p class="err">${escapeHtml(err.message)}</p><p><a class="btn" href="/login">Thử lại</a></p>`));
  }
});

// API: danh sách page (JSON - không chứa token)
app.get("/api/pages", async (req, res) => {
  const sess = getSession(parseCookies(req)[COOKIE_NAME]);
  if (!sess?.longToken) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
  try {
    const pages = sess.pages && sess.pages.length ? sess.pages : await fetchAccounts(sess.longToken);
    return res.json({ ok: true, pages: pages.map((p) => ({ id: p.id, name: p.name, picture: p.picture?.data?.url || "" })) });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// API: kiểm tra khả năng live của Page (tạo live THEO LỊCH, không phát sóng, xong xóa)
app.post("/api/live-test", async (req, res) => {
  const sess = getSession(parseCookies(req)[COOKIE_NAME]);
  if (!sess?.longToken) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
  const { pageId } = req.body || {};
  if (!pageId) return res.status(400).json({ ok: false, message: "Thiếu pageId" });
  try {
    // Lấy page access token từ /me/accounts (luôn mới nhất)
    const accounts = await fetchAccounts(sess.longToken);
    const page = accounts.find((p) => p.id === String(pageId));
    if (!page) return res.status(404).json({ ok: false, message: "Không tìm thấy Page trong tài khoản" });
    if (!page.access_token) return res.status(403).json({ ok: false, message: "Page token rỗng — thiếu quyền" });

    // Tạo live theo lịch (tương lai ~5 phút) — kiểm tra quyền mà KHÔNG phát sóng
    const startAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const createUrl = `${GRAPH}/${page.id}/live_videos?access_token=${encodeURIComponent(page.access_token)}`;
    const r = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "[Test] Kiem tra quyen live", planned_start_time: startAt }),
    });
    const j = await r.json();
    if (j.error) {
      return res.json({ ok: false, message: `Không đủ quyền live (${j.error.code}): ${j.error.message}` });
    }
    // Xóa live thử đã đặt lịch (dọn dẹp)
    if (j.id) {
      try { await fetch(`${GRAPH}/${j.id}?access_token=${encodeURIComponent(page.access_token)}`, { method: "DELETE" }); } catch {}
    }
    return res.json({ ok: true, message: "Page này ĐỦ quyền tạo livestream" });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// Đăng xuất
app.get("/logout", (req, res) => {
  deleteSession(parseCookies(req)[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME);
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`✅ App chạy tại http://localhost:${PORT}`);
  console.log(`   Graph ${GRAPH_VERSION} | Redirect URI: ${REDIRECT_URI}`);
});
