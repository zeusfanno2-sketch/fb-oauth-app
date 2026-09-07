// ============================================================
//  MR NICE — FACEBOOK ACCOUNT CONNECTION (OAuth)
//  Backend giữ nguyên (code/callback/permissions KHÔNG đổi).
//  "/"  = Account Connection UI (brand MR NICE, không dashboard)
//  "/pages" = trang nội bộ (tool preview: danh sách Page) — KHÔNG phải OAuth screen
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
// Nơi user quay về sau khi kết nối (tool chính của MR NICE)
const TOOL_URL = process.env.TOOL_URL || "/pages";
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
function saveSessions(s) { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(s)); }
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
  (req.headers.cookie || "").split(";").forEach((p) => {
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

async function exchangeCodeForToken(code) {
  const url = `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${encodeURIComponent(APP_SECRET)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${encodeURIComponent(code)}`;
  const { ok, data } = await fbGet(url);
  if (!ok || data.error) throw new Error("Đổi code lấy token thất bại: " + (data.error?.message || data.error?.code));
  return data;
}

async function exchangeLongToken(shortToken) {
  const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${encodeURIComponent(APP_SECRET)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
  const { ok, data } = await fbGet(url);
  if (!ok || data.error) throw new Error("Đổi long token thất bại: " + (data.error?.message || data.error?.code));
  return data;
}

async function fetchMe(token) {
  const { ok, data } = await fbGet(`${GRAPH}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`);
  if (!ok || data.error) throw new Error("Không lấy được user: " + (data.error?.message || ""));
  return data;
}

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

// ---------------- MR NICE shell + CSS ----------------
const SHELL_CSS = `
  :root { --bg:#fafafa; --card:#ffffff; --ink:#0d0d0f; --muted:#71717a; --line:#e7e7ea;
          --ok:#16a34a; --ok-bg:#e8f7ee; --accent:#0d0d0f; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { height:100%; }
  body { font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         background:var(--bg); color:var(--ink); display:flex; flex-direction:column; min-height:100vh; }
  .header { display:flex; align-items:center; justify-content:space-between; padding:18px 28px; }
  .logo { font-weight:800; letter-spacing:.14em; font-size:15px; text-transform:uppercase; }
  .logo em { font-style:normal; font-weight:300; }
  .user-chip { display:flex; align-items:center; gap:9px; font-size:14px; font-weight:600; }
  .user-chip .caret { color:var(--muted); font-size:10px; }
  .avatar { width:30px; height:30px; border-radius:50%; object-fit:cover; background:var(--line); display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; }
  main { flex:1; display:flex; align-items:center; justify-content:center; padding:24px; }
  .wrap { width:100%; max-width:430px; text-align:center; }
  .check { width:64px; height:64px; border-radius:50%; background:var(--ok-bg); color:var(--ok);
           display:flex; align-items:center; justify-content:center; margin:0 auto 22px; }
  .check svg { width:32px; height:32px; }
  h1 { font-size:32px; font-weight:800; letter-spacing:-.02em; line-height:1.15; }
  .sub { color:var(--muted); font-size:16px; margin-top:12px; line-height:1.6; }
  .status-pill { display:inline-flex; align-items:center; gap:8px; margin-top:22px; padding:7px 16px;
                 border-radius:999px; background:var(--ok-bg); color:var(--ok); font-size:14px; font-weight:700; }
  .status-pill .dot { width:8px; height:8px; border-radius:50%; background:var(--ok); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:20px;
          display:flex; align-items:center; gap:16px; text-align:left; margin-top:34px;
          box-shadow:0 1px 2px rgba(16,16,20,.04), 0 10px 30px -18px rgba(16,16,20,.18); }
  .card .avatar { width:52px; height:52px; font-size:22px; flex:none; }
  .card .name { font-size:17px; font-weight:800; }
  .card .meta { color:var(--muted); font-size:13.5px; margin-top:2px; }
  .card .badge { display:inline-flex; align-items:center; gap:6px; margin-top:7px; font-size:12.5px; font-weight:600;
                 color:var(--ok); }
  .btn { display:inline-block; margin-top:34px; width:100%; padding:15px 20px; border-radius:14px;
         background:var(--accent); color:#fff; font-size:16px; font-weight:700; text-decoration:none;
         border:none; cursor:pointer; }
  .btn:hover { opacity:.92; }
  .link-btn { display:block; margin-top:16px; background:none; border:none; color:var(--muted);
              font-size:14px; text-decoration:none; cursor:pointer; }
  .link-btn:hover { color:var(--ink); }
  .footer { text-align:center; padding:16px; color:#b0b0b6; font-size:11px; letter-spacing:.18em;
            text-transform:uppercase; font-weight:600; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b0c0e; --card:#131417; --ink:#f4f4f5; --muted:#8b8b93; --line:#22242a; --accent:#f4f4f5; }
    .btn { color:#0b0c0e; } .card { box-shadow:none; }
    .user-chip .caret { color:#666; } .avatar { background:#26282e; }
  }
`;

function shell(title, body, userHtml) {
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title><style>${SHELL_CSS}</style></head>
<body>
  <header class="header">
    <div class="logo">MR<em> NICE</em></div>
    ${userHtml || ""}
  </header>
  <main>${body}</main>
  <div class="footer">MR NICE</div>
</body></html>`;
}

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

function avatarHtml(picUrl, name) {
  if (picUrl) return `<img class="avatar" src="${escapeHtml(picUrl)}" alt="">`;
  const initial = ((name || "?").trim().charAt(0) || "?").toUpperCase();
  return `<span class="avatar">${escapeHtml(initial)}</span>`;
}

// ---------------- Routes ----------------

// Trang kết nối / success (OAuth screen — account connection only)
app.get("/", (req, res) => {
  const sess = getSession(parseCookies(req)[COOKIE_NAME]);
  // CHƯA kết nối → màn hình Connect
  if (!sess || !sess.longToken) {
    return res.send(shell("MR NICE — Connect", `
      <div class="wrap">
        <h1>Connect your<br>Facebook account</h1>
        <p class="sub">Kết nối tài khoản Facebook để sử dụng công cụ MR NICE.</p>
        <a class="btn" href="/login">Connect Account</a>
        <a class="link-btn" href="${escapeHtml(TOOL_URL)}">Back to Tool</a>
      </div>`));
  }
  // ĐÃ kết nối → màn hình xác nhận (success screen)
  const u = sess.user;
  const name = u.name || "";
  const initial = (name.charAt(0) || "?").toUpperCase();
  const pic = u.picture || "";
  return res.send(shell("MR NICE — Connected", `
      <div class="wrap">
        <div class="check">${CHECK_SVG}</div>
        <h1>Hi ${escapeHtml(name)}! 👋</h1>
        <p class="sub">Tài khoản của bạn đã được kết nối thành công.</p>
        <div class="status-pill"><span class="dot"></span>Connected</div>
        <div class="card">
          ${pic ? `<img class="avatar" src="${escapeHtml(pic)}" alt="">` : `<span class="avatar">${escapeHtml(initial)}</span>`}
          <div>
            <div class="name">${escapeHtml(name)}</div>
            <div class="meta">Connected account</div>
            <div class="badge">${CHECK_SVG.replace('width="32" height="32"', 'width="13" height="13"')} Active</div>
          </div>
        </div>
        <a class="btn" href="${escapeHtml(TOOL_URL)}">Back to Tool</a>
        <a class="link-btn" href="/logout">Disconnect account</a>
      </div>`,
      `<div class="user-chip">${avatarHtml(pic, name)}<span>${escapeHtml(name)}</span><span class="caret">▾</span></div>`));
});

// Trang tool preview (nội bộ — danh sách Page + kiểm tra live; KHÔNG phải OAuth screen)
app.get("/pages", async (req, res) => {
  const sess = getSession(parseCookies(req)[COOKIE_NAME]);
  if (!sess || !sess.longToken) return res.redirect("/");
  try {
    const pages = await fetchAccounts(sess.longToken);
    sess.pages = pages;
    setSession(sess);
    const rows = pages.map((p) => `
      <tr>
        <td>${p.picture?.data?.url ? `<img class="avatar" src="${escapeHtml(p.picture.data.url)}">` : ""} <b>${escapeHtml(p.name)}</b></td>
        <td><code style="font-size:12px">${escapeHtml(p.id)}</code></td>
        <td><button class="btn" style="margin:0;padding:8px 14px;font-size:13px;width:auto" onclick="liveTest('${escapeHtml(p.id)}')">Kiểm tra live</button> <span id="st-${escapeHtml(p.id)}"></span></td>
      </tr>`).join("");
    return res.send(shell("MR NICE — Pages", `
      <div class="wrap" style="max-width:820px">
        <h1 style="font-size:24px">Danh sách Page</h1>
        <p class="sub">${pages.length} Page · tool nội bộ (preview)</p>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;text-align:left;font-size:14px">
          <thead><tr style="color:var(--muted);font-size:13px">
            <th style="padding:8px 10px;border-bottom:1px solid var(--line)">Page</th>
            <th style="padding:8px 10px;border-bottom:1px solid var(--line)">ID</th>
            <th style="padding:8px 10px;border-bottom:1px solid var(--line)">Live</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <a class="btn" style="margin-top:26px" href="/">Về màn hình kết nối</a>
      </div>
      <script>
      async function liveTest(pageId) {
        const el = document.getElementById('st-' + pageId);
        el.textContent = '...';
        try {
          const r = await fetch('/api/live-test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pageId }) });
          const j = await r.json();
          el.innerHTML = j.ok ? '<span style="color:var(--ok)">✔ ' + j.message + '</span>' : '<span style="color:#e41e3f">✘ ' + j.message + '</span>';
        } catch (e) { el.textContent = 'Lỗi kết nối'; }
      }
      </script>`,
      `<div class="user-chip">${avatarHtml(sess.user.picture || "", sess.user.name)}<span>${escapeHtml(sess.user.name || "")}</span><span class="caret">▾</span></div>`));
  } catch (err) {
    console.error("Lỗi /pages:", err.message);
    return res.redirect("/");
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

// Callback OAuth (backend giữ nguyên)
app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    const savedState = parseCookies(req).oauth_state;
    if (error) return res.status(400).send(shell("MR NICE — Lỗi", `<div class="wrap"><h1>Chưa kết nối được</h1><p class="sub">${escapeHtml(error_description || error)}</p><a class="btn" href="/login">Thử lại</a></div>`));
    if (!code) return res.status(400).send(shell("MR NICE — Lỗi", `<div class="wrap"><h1>Thiếu mã xác nhận</h1><a class="btn" href="/login">Thử lại</a></div>`));
    if (!savedState || savedState !== state) return res.status(400).send(shell("MR NICE — Lỗi", `<div class="wrap"><h1>Yêu cầu không hợp lệ</h1><a class="btn" href="/login">Đăng nhập lại</a></div>`));

    const short = await exchangeCodeForToken(code);
    const long = await exchangeLongToken(short.access_token);
    const me = await fetchMe(long.access_token);

    const sid = crypto.randomBytes(24).toString("hex");
    setSession({
      sid,
      user: {
        id: me.id,
        name: me.name,
        email: me.email || "",
        picture: me.picture?.data?.url || "",
      },
      longToken: long.access_token,
      longTokenExp: long.expires_in ? Math.floor(Date.now() / 1000) + long.expires_in : 0,
      createdAt: Date.now(),
    });
    res.cookie(COOKIE_NAME, sid, { httpOnly: true, sameSite: "lax", maxAge: 60 * 24 * 3600 * 1000 });
    res.redirect("/");
  } catch (err) {
    console.error("Callback error:", err.message);
    res.status(500).send(shell("MR NICE — Lỗi", `<div class="wrap"><h1>Có lỗi xảy ra</h1><p class="sub">${escapeHtml(err.message)}</p><a class="btn" href="/login">Thử lại</a></div>`));
  }
});

// API: danh sách page (JSON — không chứa token)
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

// API: kiểm tra khả năng live của Page (tạo live theo lịch, không phát sóng, xong xóa)
app.post("/api/live-test", async (req, res) => {
  const sess = getSession(parseCookies(req)[COOKIE_NAME]);
  if (!sess?.longToken) return res.status(401).json({ ok: false, message: "Chưa đăng nhập" });
  const { pageId } = req.body || {};
  if (!pageId) return res.status(400).json({ ok: false, message: "Thiếu pageId" });
  try {
    const accounts = await fetchAccounts(sess.longToken);
    const page = accounts.find((p) => p.id === String(pageId));
    if (!page) return res.status(404).json({ ok: false, message: "Không tìm thấy Page trong tài khoản" });
    if (!page.access_token) return res.status(403).json({ ok: false, message: "Page token rỗng — thiếu quyền" });
    const startAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const createUrl = `${GRAPH}/${page.id}/live_videos?access_token=${encodeURIComponent(page.access_token)}`;
    const r = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "[Test] Kiem tra quyen live", planned_start_time: startAt }),
    });
    const j = await r.json();
    if (j.error) return res.json({ ok: false, message: `Không đủ quyền live (${j.error.code}): ${j.error.message}` });
    if (j.id) {
      try { await fetch(`${GRAPH}/${j.id}?access_token=${encodeURIComponent(page.access_token)}`, { method: "DELETE" }); } catch {}
    }
    return res.json({ ok: true, message: "Page này ĐỦ quyền tạo livestream" });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// Đăng xuất / ngắt kết nối
app.get("/logout", (req, res) => {
  deleteSession(parseCookies(req)[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME);
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`✅ MR NICE app chạy tại http://localhost:${PORT}`);
  console.log(`   Graph ${GRAPH_VERSION} | Redirect URI: ${REDIRECT_URI} | Tool URL: ${TOOL_URL}`);
});
