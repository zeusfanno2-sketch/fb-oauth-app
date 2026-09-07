require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env["APP" + "_SECRET"];
const REDIRECT_URI = process.env.REDIRECT_URI;
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v25.0";
const PORT = process.env.PORT || 3000;
const TOOL_URL = process.env.TOOL_URL || "/";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";
const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || "";
const DATA_DIR = path.join(__dirname, "data");
const SID_COOKIE = "ns_sid";
const SCOPE = ["public_profile", "email", "pages_show_list", "pages_manage_posts", "pages_read_engagement", "publish_video"].join(",");
const ENC_ALGO = "aes-256-gcm";

for (const name of ["APP_ID", "APP_SECRET", "REDIRECT_URI"]) {
  if (!process.env[name]) {
    console.error(`[BLOCKED] Thieu env ${name} — khong the khoi dong`);
    process.exit(1);
  }
}
if (!TOKEN_ENC_KEY || TOKEN_ENC_KEY.length < 16) {
  console.error("[BLOCKED] Thieu env TOKEN_ENC_KEY (toi thieu 16 ky tu) — dung de ma hoa token");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

const ENC_KEY = crypto.createHash("sha256").update(TOKEN_ENC_KEY).digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decrypt(payload) {
  try {
    const [ivB64, tagB64, dataB64] = String(payload).split(".");
    const decipher = crypto.createDecipheriv(ENC_ALGO, ENC_KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const target = path.join(DATA_DIR, file);
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
}

const USERS_FILE = "users.json";
const CONNS_FILE = "connections.json";
const PAGES_FILE = "pages.json";
const TOKENS_FILE = "api_tokens.json";
const SESSIONS_FILE = "sessions.json";

function loadUsers() { return readJson(USERS_FILE, []); }
function saveUsers(u) { writeJson(USERS_FILE, u); }
function loadConns() { return readJson(CONNS_FILE, []); }
function saveConns(c) { writeJson(CONNS_FILE, c); }
function loadPages() { return readJson(PAGES_FILE, []); }
function savePages(p) { writeJson(PAGES_FILE, p); }
function loadApiTokens() { return readJson(TOKENS_FILE, []); }
function saveApiTokens(t) { writeJson(TOKENS_FILE, t); }
function loadSessions() { return readJson(SESSIONS_FILE, {}); }
function saveSessions(s) { writeJson(SESSIONS_FILE, s); }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function createUser(email, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    email: String(email).toLowerCase().trim(),
    password_salt: salt,
    password_hash: hashPassword(password, salt),
    created_at: Date.now(),
  };
}

function verifyPassword(user, password) {
  return user && hashPassword(password, user.password_salt) === user.password_hash;
}

function findUserByEmail(users, email) {
  const e = String(email).toLowerCase().trim();
  return users.find((u) => u.email === e) || null;
}

function createSession(userId) {
  const sid = crypto.randomBytes(24).toString("hex");
  const sessions = loadSessions();
  sessions[sid] = { user_id: userId, created_at: Date.now() };
  saveSessions(sessions);
  return sid;
}

function destroySession(sid) {
  const sessions = loadSessions();
  delete sessions[sid];
  saveSessions(sessions);
}

function sessionUser(req) {
  const sid = parseCookies(req)[SID_COOKIE];
  if (!sid) return null;
  const sessions = loadSessions();
  const rec = sessions[sid];
  if (!rec) return null;
  return loadUsers().find((u) => u.id === rec.user_id) || null;
}

function createApiToken(userId) {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokens = loadApiTokens();
  tokens.push({ token_hash: crypto.createHash("sha256").update(raw).digest("hex"), user_id: userId, created_at: Date.now() });
  saveApiTokens(tokens);
  return raw;
}

function bearerUser(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const hash = crypto.createHash("sha256").update(m[1]).digest("hex");
  const tokens = loadApiTokens();
  const rec = tokens.find((t) => t.token_hash === hash);
  if (!rec) return null;
  return loadUsers().find((u) => u.id === rec.user_id) || null;
}

function authUser(req) {
  const bearer = bearerUser(req);
  if (bearer) return { user: bearer, via: "api" };
  const web = sessionUser(req);
  if (web) return { user: web, via: "web" };
  return { user: null, via: null };
}

function userConns(userId) {
  return loadConns().filter((c) => c.user_id === userId);
}

function connPages(connId) {
  return loadPages().filter((p) => p.connection_id === connId);
}

function redactToken(text) {
  return String(text).replace(/(EAAG|EAA|EAAB)[A-Za-z0-9]+/g, "[REDACTED]");
}

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
  if (!ok || data.error) throw new Error("Exchange code that bai: " + (data.error?.message || data.error?.code));
  return data;
}

async function exchangeLongToken(shortToken) {
  const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${encodeURIComponent(APP_SECRET)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
  const { ok, data } = await fbGet(url);
  if (!ok || data.error) throw new Error("Exchange long token that bai: " + (data.error?.message || data.error?.code));
  return data;
}

async function fetchMe(token) {
  const { ok, data } = await fbGet(`${GRAPH}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`);
  if (!ok || data.error) throw new Error("Lay user that bai: " + (data.error?.message || ""));
  return data;
}

async function fetchAccounts(token) {
  const pages = [];
  let url = `${GRAPH}/me/accounts?fields=id,name,access_token,picture.type(square)&limit=100&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const { ok, data } = await fbGet(url);
    if (!ok || data.error) throw new Error("Lay pages that bai: " + (data.error?.message || ""));
    pages.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return pages;
}

function connectionStatus(conn) {
  if (conn.status !== "ACTIVE") return conn.status;
  if (conn.expires_at && conn.expires_at > 0 && Date.now() / 1000 > conn.expires_at) return "EXPIRED";
  if (conn.expires_at && conn.expires_at > 0 && conn.expires_at - Date.now() / 1000 < 7 * 86400) return "EXPIRING";
  return "ACTIVE";
}

async function refreshPagesForConnection(conn, log) {
  const pages = await fetchAccounts(decrypt(conn.long_token_enc));
  const all = loadPages();
  const keep = all.filter((p) => p.connection_id !== conn.id);
  const fresh = pages.map((p) => ({
    id: crypto.randomUUID(),
    connection_id: conn.id,
    page_id: String(p.id),
    page_name: p.name || "",
    page_token_enc: p.access_token ? encrypt(p.access_token) : "",
    picture: p.picture?.data?.url || "",
    updated_at: Date.now(),
  }));
  savePages([...keep, ...fresh]);
  return fresh;
}

const SHELL_CSS = `
  :root { --bg:#fafafa; --card:#ffffff; --ink:#0d0d0f; --muted:#71717a; --line:#e7e7ea;
          --ok:#16a34a; --ok-bg:#e8f7ee; --danger:#e41e3f; --accent:#0d0d0f; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { height:100%; }
  body { font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         background:var(--bg); color:var(--ink); display:flex; flex-direction:column; min-height:100vh; }
  .header { display:flex; align-items:center; justify-content:space-between; padding:18px 28px; }
  .logo { font-weight:800; letter-spacing:.14em; font-size:15px; text-transform:uppercase; }
  .logo em { font-style:normal; font-weight:300; }
  .user-chip { display:flex; align-items:center; gap:9px; font-size:14px; font-weight:600; }
  .avatar { width:30px; height:30px; border-radius:50%; object-fit:cover; background:var(--line); display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; }
  main { flex:1; display:flex; align-items:center; justify-content:center; padding:24px; }
  .wrap { width:100%; max-width:430px; text-align:center; }
  .wrap.wide { max-width:820px; }
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
  .btn { display:inline-block; margin-top:20px; width:100%; padding:15px 20px; border-radius:14px;
         background:var(--accent); color:#fff; font-size:16px; font-weight:700; text-decoration:none;
         border:none; cursor:pointer; font-family:inherit; }
  .btn:hover { opacity:.92; }
  .btn.secondary { background:transparent; color:var(--ink); border:1px solid var(--line); }
  .link-btn { display:block; margin-top:16px; background:none; border:none; color:var(--muted);
              font-size:14px; text-decoration:none; cursor:pointer; font-family:inherit; }
  .link-btn:hover { color:var(--ink); }
  .field { text-align:left; margin-top:14px; }
  .field label { display:block; font-size:13px; font-weight:600; color:var(--muted); margin-bottom:6px; }
  .field input { width:100%; padding:13px 15px; border-radius:12px; border:1px solid var(--line);
                 background:var(--card); color:var(--ink); font-size:15px; outline:none; font-family:inherit; }
  .field input:focus { border-color:var(--ink); }
  .error { color:var(--danger); font-size:14px; margin-top:12px; min-height:18px; }
  .footer { text-align:center; padding:16px; color:#b0b0b6; font-size:11px; letter-spacing:.18em;
            text-transform:uppercase; font-weight:600; }
  table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; }
  th { padding:8px 10px; border-bottom:1px solid var(--line); color:var(--muted); font-size:13px; }
  td { padding:10px; border-bottom:1px solid var(--line); vertical-align:middle; }
  .pill { display:inline-block; padding:3px 11px; border-radius:999px; font-size:12px; font-weight:700; }
  .pill.ok { background:var(--ok-bg); color:var(--ok); }
  .pill.warn { background:#fef3c7; color:#b45309; }
  .pill.bad { background:#fde8ec; color:var(--danger); }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b0c0e; --card:#131417; --ink:#f4f4f5; --muted:#8b8b93; --line:#22242a; --accent:#f4f4f5; }
    .btn { color:#0b0c0e; } .btn.secondary { color:#f4f4f5; } .card { box-shadow:none; }
    .avatar { background:#26282e; } .field input { background:#0e0f11; }
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
  return `<span class="avatar">${escapeHtml(((name || "?").trim().charAt(0) || "?").toUpperCase())}</span>`;
}

function pillFor(status) {
  if (status === "ACTIVE") return `<span class="pill ok">Connected</span>`;
  if (status === "EXPIRING") return `<span class="pill warn">Expiring soon</span>`;
  return `<span class="pill bad">${escapeHtml(status === "EXPIRED" ? "Token expired" : status === "REVOKED" ? "Revoked" : "Invalid")}</span>`;
}

function loggedInShell(req, res, title, body) {
  const user = sessionUser(req);
  const chip = user
    ? `<div class="user-chip"><span class="avatar">${escapeHtml((user.email || "?").charAt(0).toUpperCase())}</span><span>${escapeHtml(user.email)}</span></div>`
    : "";
  return res.send(shell(title, body, chip));
}

app.get("/", (req, res) => {
  const user = sessionUser(req);
  if (!user) {
    return res.send(shell("MR NICE — Nice Stream", `
      <div class="wrap">
        <h1>Nice Stream</h1>
        <p class="sub">Đăng nhập tài khoản Nice Stream để quản lý kết nối Facebook của bạn.</p>
        <form method="post" action="/auth/login">
          <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"></div>
          <div class="field"><label>Mật khẩu</label><input type="password" name="password" required autocomplete="current-password"></div>
          <div class="error" id="err"></div>
          <button class="btn" type="submit">Đăng nhập</button>
        </form>
        <a class="link-btn" href="/register">Tạo tài khoản mới</a>
      </div>`));
  }
  const conns = userConns(user.id);
  const active = conns.find((c) => connectionStatus(c) === "ACTIVE" || connectionStatus(c) === "EXPIRING");
  if (!active) {
    return loggedInShell(req, res, "MR NICE — Connect", `
      <div class="wrap">
        <h1>Xin chào 👋</h1>
        <p class="sub">Kết nối tài khoản Facebook để sử dụng Nice Stream.</p>
        <a class="btn" href="/oauth/login">Connect Account</a>
        <a class="link-btn" href="/logout">Đăng xuất</a>
      </div>`);
  }
  const u = JSON.parse(decrypt(active.user_json_enc) || "{}");
  return loggedInShell(req, res, "MR NICE — Connected", `
      <div class="wrap">
        <div class="check">${CHECK_SVG}</div>
        <h1>Hi ${escapeHtml(u.name || "")}! 👋</h1>
        <p class="sub">Tài khoản của bạn đã được kết nối thành công.</p>
        <div class="status-pill"><span class="dot"></span>${escapeHtml(active.fb_name)}</div>
        <a class="btn" href="/account">Về tài khoản</a>
        <a class="link-btn" href="/oauth/disconnect?id=${encodeURIComponent(active.id)}">Disconnect account</a>
      </div>`);
});

app.get("/register", (req, res) => {
  return res.send(shell("MR NICE — Đăng ký", `
    <div class="wrap">
      <h1>Tạo tài khoản</h1>
      <p class="sub">Tài khoản Nice Stream — không phải tài khoản Facebook.</p>
      <form method="post" action="/auth/register">
        <div class="field"><label>Email</label><input type="email" name="email" required></div>
        <div class="field"><label>Mật khẩu (tối thiểu 8 ký tự)</label><input type="password" name="password" required minlength="8"></div>
        <div class="error" id="err"></div>
        <button class="btn" type="submit">Đăng ký</button>
      </form>
      <a class="link-btn" href="/">Đã có tài khoản — đăng nhập</a>
    </div>`));
});

app.post("/auth/register", (req, res) => {
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).send("Email khong hop le");
  if (password.length < 8) return res.status(400).send("Mat khau toi thieu 8 ky tu");
  const users = loadUsers();
  if (findUserByEmail(users, email)) return res.status(409).send("Email da duoc dang ky");
  const user = createUser(email, password);
  users.push(user);
  saveUsers(users);
  const sid = createSession(user.id);
  res.cookie(SID_COOKIE, sid, { httpOnly: true, sameSite: "lax", maxAge: 90 * 24 * 3600 * 1000 });
  res.redirect("/");
});

app.post("/auth/login", (req, res) => {
  const users = loadUsers();
  const user = findUserByEmail(users, req.body.email || "");
  if (!user || !verifyPassword(user, req.body.password || "")) {
    return res.status(401).send("Sai email hoac mat khau");
  }
  const sid = createSession(user.id);
  res.cookie(SID_COOKIE, sid, { httpOnly: true, sameSite: "lax", maxAge: 90 * 24 * 3600 * 1000 });
  const next = String(req.body.next || "/");
  res.redirect(next.startsWith("/") ? next : "/");
});

app.get("/logout", (req, res) => {
  const sid = parseCookies(req)[SID_COOKIE];
  if (sid) destroySession(sid);
  res.clearCookie(SID_COOKIE);
  res.redirect("/");
});

app.get("/account", (req, res) => {
  const { user } = authUser(req);
  if (!user) return res.redirect("/");
  const conns = userConns(user.id);
  const rows = conns.map((c) => {
    const status = connectionStatus(c);
    const pages = connPages(c.id);
    return `<tr>
      <td><b>${escapeHtml(c.fb_name)}</b><br><span style="color:var(--muted);font-size:12px">${escapeHtml(c.fb_id)}</span></td>
      <td>${pages.length} Page</td>
      <td>${pillFor(status)}</td>
      <td><a href="/oauth/disconnect?id=${encodeURIComponent(c.id)}" style="color:var(--danger)">Disconnect</a></td>
    </tr>`;
  }).join("");
  return loggedInShell(req, res, "MR NICE — Tài khoản", `
    <div class="wrap wide">
      <h1 style="font-size:24px">Tài khoản</h1>
      <p class="sub">${escapeHtml(user.email)} · ${conns.length} kết nối Facebook</p>
      ${conns.length === 0 ? `<a class="btn" href="/oauth/login">Connect Account</a>` : `
      <table style="margin-top:18px">
        <thead><tr><th>Facebook</th><th>Pages</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <a class="btn secondary" style="margin-top:16px" href="/oauth/login">+ Kết nối tài khoản Facebook khác</a>`}
      <a class="link-btn" href="/logout">Đăng xuất</a>
    </div>`);
});

app.get("/oauth/login", (req, res) => {
  const user = sessionUser(req);
  if (!user) return res.redirect("/");
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
  const p = new URLSearchParams({ client_id: APP_ID, redirect_uri: REDIRECT_URI, state, scope: SCOPE, response_type: "code" });
  res.redirect(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`);
});

app.get("/auth/callback", async (req, res) => {
  const user = sessionUser(req);
  if (!user) return res.redirect("/");
  const { code, state, error, error_description } = req.query;
  const savedState = parseCookies(req).oauth_state;
  if (error) return loggedInShell(req, res, "MR NICE — Lỗi", `<div class="wrap"><h1>Chưa kết nối được</h1><p class="sub">${escapeHtml(error_description || error)}</p><a class="btn" href="/oauth/login">Thử lại</a></div>`);
  if (!code || !savedState || savedState !== state) return loggedInShell(req, res, "MR NICE — Lỗi", `<div class="wrap"><h1>Yêu cầu không hợp lệ</h1><a class="btn" href="/oauth/login">Thử lại</a></div>`);
  try {
    const short = await exchangeCodeForToken(code);
    const long = await exchangeLongToken(short.access_token);
    const me = await fetchMe(long.access_token);
    const conns = loadConns();
    const dup = conns.find((c) => c.user_id === user.id && c.fb_id === String(me.id));
    if (dup) {
      dup.long_token_enc = encrypt(long.access_token);
      dup.expires_at = long.expires_in ? Math.floor(Date.now() / 1000) + long.expires_in : 0;
      dup.status = "ACTIVE";
      dup.updated_at = Date.now();
      saveConns(conns);
    } else {
      conns.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        fb_id: String(me.id),
        fb_name: me.name || "",
        fb_email: me.email || "",
        user_json_enc: encrypt(JSON.stringify({ id: me.id, name: me.name || "", email: me.email || "", picture: me.picture?.data?.url || "" })),
        long_token_enc: encrypt(long.access_token),
        expires_at: long.expires_in ? Math.floor(Date.now() / 1000) + long.expires_in : 0,
        status: "ACTIVE",
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      saveConns(conns);
    }
    res.clearCookie("oauth_state");
    return res.redirect("/");
  } catch (err) {
    console.error("[callback]", redactToken(err.message));
    return loggedInShell(req, res, "MR NICE — Lỗi", `<div class="wrap"><h1>Có lỗi xảy ra</h1><p class="sub">${escapeHtml(redactToken(err.message))}</p><a class="btn" href="/oauth/login">Thử lại</a></div>`);
  }
});

app.get("/oauth/disconnect", (req, res) => {
  const user = sessionUser(req);
  if (!user) return res.redirect("/");
  const conns = loadConns();
  const idx = conns.findIndex((c) => c.id === req.query.id && c.user_id === user.id);
  if (idx >= 0) {
    conns.splice(idx, 1);
    saveConns(conns);
    const pages = loadPages();
    savePages(pages.filter((p) => p.connection_id !== req.query.id));
  }
  res.redirect("/account");
});

app.post("/api/auth/register", (req, res) => {
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, message: "Email khong hop le" });
  if (password.length < 8) return res.status(400).json({ ok: false, message: "Mat khau toi thieu 8 ky tu" });
  const users = loadUsers();
  if (findUserByEmail(users, email)) return res.status(409).json({ ok: false, message: "Email da duoc dang ky" });
  const user = createUser(email, password);
  users.push(user);
  saveUsers(users);
  const api_token = createApiToken(user.id);
  return res.json({ ok: true, api_token, email: user.email });
});

app.post("/api/auth/login", (req, res) => {
  const users = loadUsers();
  const user = findUserByEmail(users, req.body.email || "");
  if (!user || !verifyPassword(user, req.body.password || "")) {
    return res.status(401).json({ ok: false, message: "Sai email hoac mat khau" });
  }
  const api_token = createApiToken(user.id);
  return res.json({ ok: true, api_token, email: user.email });
});

function requireApiUser(req, res) {
  const user = bearerUser(req);
  if (!user) {
    res.status(401).json({ ok: false, message: "Thieu hoac sai api_token" });
    return null;
  }
  return user;
}

app.get("/api/me", (req, res) => {
  const user = requireApiUser(req, res);
  if (!user) return;
  const conns = userConns(user.id).map((c) => ({
    id: c.id,
    fb_id: c.fb_id,
    fb_name: c.fb_name,
    status: connectionStatus(c),
    expires_at: c.expires_at,
  }));
  return res.json({ ok: true, email: user.email, connections: conns });
});

app.get("/api/connections/:id/pages", async (req, res) => {
  const user = requireApiUser(req, res);
  if (!user) return;
  const conn = userConns(user.id).find((c) => c.id === req.params.id);
  if (!conn) return res.status(404).json({ ok: false, message: "Khong tim thay connection" });
  const status = connectionStatus(conn);
  if (status !== "ACTIVE" && status !== "EXPIRING") {
    return res.status(403).json({ ok: false, message: "Connection expired. Please reconnect." });
  }
  try {
    const fresh = await refreshPagesForConnection(conn);
    return res.json({ ok: true, pages: fresh.map((p) => ({ id: p.page_id, name: p.page_name, picture: p.picture })) });
  } catch (err) {
    console.error("[pages]", redactToken(err.message));
    const code = /code\s*[:=]\s*(\d+)/i.exec(String(err.message))?.[1];
    if (code === "190") {
      conn.status = "INVALID";
      saveConns(loadConns().map((c) => (c.id === conn.id ? conn : c)));
      return res.status(403).json({ ok: false, message: "Connection expired. Please reconnect." });
    }
    return res.status(500).json({ ok: false, message: redactToken(err.message) });
  }
});

app.post("/api/live", async (req, res) => {
  const user = requireApiUser(req, res);
  if (!user) return;
  const { connection_id, page_id, title, description, is_scheduled, scheduled_start_time } = req.body || {};
  if (!connection_id || !page_id) return res.status(400).json({ ok: false, message: "Thieu connection_id hoac page_id" });
  const conn = userConns(user.id).find((c) => c.id === connection_id);
  if (!conn) return res.status(404).json({ ok: false, message: "Khong tim thay connection" });
  const status = connectionStatus(conn);
  if (status !== "ACTIVE" && status !== "EXPIRING") {
    return res.status(403).json({ ok: false, message: "Connection expired. Please reconnect." });
  }
  try {
    const pages = await refreshPagesForConnection(conn);
    const page = pages.find((p) => p.page_id === String(page_id));
    if (!page) return res.status(404).json({ ok: false, message: "Page khong thuoc connection nay" });
    const pageToken = decrypt(page.page_token_enc);
    if (!pageToken) return res.status(403).json({ ok: false, message: "Page token rong" });
    const params = {
      title: String(title || "Facebook Live").slice(0, 255),
      description: String(description || title || "Facebook Live").slice(0, 2000),
      status: is_scheduled ? "SCHEDULED_UNPUBLISHED" : "LIVE_NOW",
    };
    if (is_scheduled && scheduled_start_time) {
      params.scheduled_publish_time = Math.floor(new Date(scheduled_start_time).getTime() / 1000);
    }
    const r = await fetch(`${GRAPH}/${page.page_id}/live_videos?access_token=${encodeURIComponent(pageToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const j = await r.json();
    if (j.error) {
      return res.status(200).json({ ok: false, http: r.status, fb_error_code: j.error.code, message: redactToken(j.error.message), hint: fbErrorHint(j.error.code) });
    }
    return res.json({
      ok: true,
      video_id: j.id || "",
      stream_url: j.stream_url || "",
      stream_key: j.stream_key || "",
      live_url: j.permalink_url || `https://www.facebook.com/${page.page_id}/videos/${j.id}`,
      status: params.status,
    });
  } catch (err) {
    console.error("[live]", redactToken(err.message));
    return res.status(500).json({ ok: false, message: redactToken(err.message) });
  }
});

function fbErrorHint(code) {
  const hints = {
    3: "App chua duoc Meta cap quyen Live Video API (App Review / Standard access). Kiem tra App Dashboard -> App Review -> Permissions and Features.",
    100: "Tham so khong hop le hoac Page khong ho tro tinh nang nay.",
    190: "Token het han hoac bi thu hoi. Connection expired. Please reconnect.",
    200: "Thieu quyen (permission) cho thao tac nay.",
    10: "Thieu quyen (permission) cho thao tac nay.",
  };
  return hints[code] || "Loi tu Facebook — xem message de biet chi tiet.";
}

app.post("/api/live/end", async (req, res) => {
  const user = requireApiUser(req, res);
  if (!user) return;
  const { connection_id, video_id } = req.body || {};
  if (!connection_id || !video_id) return res.status(400).json({ ok: false, message: "Thieu connection_id hoac video_id" });
  const conn = userConns(user.id).find((c) => c.id === connection_id);
  if (!conn) return res.status(404).json({ ok: false, message: "Khong tim thay connection" });
  const pages = loadPages().filter((p) => p.connection_id === conn.id);
  const page = pages.find((p) => p.page_token_enc) || pages[0];
  if (!page) return res.status(404).json({ ok: false, message: "Khong co page token" });
  const pageToken = decrypt(page.page_token_enc);
  try {
    const r = await fetch(`${GRAPH}/${video_id}?access_token=${encodeURIComponent(pageToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_live_video: true }),
    });
    const j = await r.json();
    if (j.error) return res.status(200).json({ ok: false, message: redactToken(j.error.message), fb_error_code: j.error.code });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: redactToken(err.message) });
  }
});

app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`MR NICE (Nice Stream) chay tai ${BASE_URL}`);
  console.log(`Graph ${GRAPH_VERSION} | Redirect URI: ${REDIRECT_URI} | Tool URL: ${TOOL_URL}`);
});
