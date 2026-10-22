/* SkyFocus desktop: the Electron main process.
   Serves the web app from the app folder over a private skyfocus:// scheme (so it has a stable origin,
   its own storage and a strict Content-Security-Policy), and adds what a browser cannot: a frameless
   window with embedded controls, the always-on-top mini pill, a tray icon, native notifications,
   taskbar progress, focus tracking for airplane mode and launch at startup. */
"use strict";
const { app, BrowserWindow, ipcMain, protocol, net, shell, Tray, Menu, Notification, nativeImage, screen, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const SCHEME = "skyfocus";
const ORIGIN = SCHEME + "://app";
const TILES = "https://server.arcgisonline.com";
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: " + TILES,
  "font-src 'self' data:",
  "connect-src 'self' " + TILES,
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join("; ");
const ICON = path.join(__dirname, "icons", "icon.png");
const PILL = { w: 336, h: 80, wide: 464 };   // window sizes around the 320 x 64 pill (8 px margin for the glow)
const TEST = !!process.env.SKYFOCUS_SHOT;   // automated capture run (see the test hooks below)

app.setAppUserModelId("au.com.hyetech.skyfocus");
if (process.env.SKYFOCUS_USERDATA) app.setPath("userData", process.env.SKYFOCUS_USERDATA);   // isolated test profiles
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

/* ---------- small persisted state: window bounds, pill position, desktop preferences ---------- */
const STATE_FILE = () => path.join(app.getPath("userData"), "desktop-state.json");
let state = { window: null, pill: null, prefs: { pillOnMinimise: true, pillClickThrough: false, launchAtStartup: false }, closeHintShown: false, firstRunDone: false };
function loadState() {
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"))); state.prefs = Object.assign({ pillOnMinimise: true, pillClickThrough: false, launchAtStartup: false }, state.prefs); } catch (e) { /* first launch */ }
}
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStateNow, 300);
}
function saveStateNow() {
  clearTimeout(saveTimer);
  try { fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2)); } catch (e) { /* read-only disk */ }
}

let win = null, pillWin = null, tray = null, quitting = false;
let snap = { kind: "idle" };   // the latest pill snapshot from the app
let presence = { focused: true, visible: true };
let shown = true;   // the main window is on screen (its animation loops skip drawing when it is not)

/* ---------- single instance ---------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else app.on("second-instance", () => showMain());

/* ---------- serving the app ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webp": "image/webp"
};
const vendorCache = new Map();   // vendor files never change while the app runs
function serve() {
  protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response("Not found", { status: 404 });
    const type = MIME[path.extname(file).toLowerCase()];
    if (TEST && process.env.SKYFOCUS_LOG_SERVE) testLog("serve " + rel);
    // known types are read straight from disk; media (which may ask for byte ranges) and anything else go through net.fetch
    if (type && !req.headers.get("range")) {
      try {
        const vendor = rel.startsWith("vendor/");
        let body = vendor ? vendorCache.get(file) : null;
        if (!body) { body = await fs.promises.readFile(file); if (vendor) vendorCache.set(file, body); }
        const headers = { "Content-Type": type, "Content-Length": String(body.length) };
        if (/\.html?$/i.test(file)) headers["Content-Security-Policy"] = CSP;
        return new Response(body, { status: 200, headers });
      } catch (e) {
        return new Response("Not found", { status: 404 });
      }
    }
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      if (!res.ok) return res;
      const headers = new Headers(res.headers);
      if (/\.html?$/i.test(file)) headers.set("Content-Security-Policy", CSP);
      return new Response(res.body, { status: 200, headers });
    } catch (e) {
      return new Response("Not found", { status: 404 });
    }
  });
}

/* ---------- guards shared by both windows ---------- */
function openExternal(url) {
  if (TEST) { testLog("external " + url); return; }
  shell.openExternal(url);
}
function guard(wc) {
  wc.on("will-navigate", (e, target) => {
    if (!target.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/i.test(target)) openExternal(target); }
  });
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) openExternal(url); return { action: "deny" }; });
  wc.on("will-attach-webview", (e) => e.preventDefault());
  wc.session.setPermissionRequestHandler((w, perm, cb) => cb(perm === "notifications" || perm === "fullscreen"));
}
function prefsFor(preload) {
  return { preload: path.join(__dirname, preload), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false, v8CacheOptions: "bypassHeatCheck" };
}

/* ---------- main window ---------- */
function createMain() {
  const ws = state.window;
  win = new BrowserWindow({
    x: ws && ws.bounds ? ws.bounds.x : undefined, y: ws && ws.bounds ? ws.bounds.y : undefined,
    width: ws && ws.bounds ? ws.bounds.width : 1366, height: ws && ws.bounds ? ws.bounds.height : 800,
    minWidth: 1100, minHeight: 700, frame: false, show: false, backgroundColor: "#0b0c0f",
    title: "SkyFocus", icon: ICON, webPreferences: prefsFor("preload.js")
  });
  if (TEST) {
    // automated captures run off screen and never take focus
    const sz = (process.env.SKYFOCUS_SIZE || "1366x768").split("x").map(Number);
    win.setBounds({ x: -6000, y: 0, width: sz[0], height: sz[1] });
    win.once("ready-to-show", () => win.showInactive());
    win.webContents.setAudioMuted(true);   // test runs are silent
  } else {
    if (!ws || ws.maximized) win.maximize();   // first launch opens maximised
    win.once("ready-to-show", () => win.show());
  }
  guard(win.webContents);
  win.loadURL(ORIGIN + "/index.html" + (process.env.SKYFOCUS_QUERY || ""));

  const sendState = () => { if (win && !win.isDestroyed()) win.webContents.send("win:state", { maximized: win.isMaximized(), fullscreen: win.isFullScreen() }); };
  ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "restore"].forEach((ev) => win.on(ev, () => { sendState(); rememberWindow(); }));
  ["resize", "move"].forEach((ev) => win.on(ev, rememberWindow));
  win.webContents.on("did-finish-load", sendState);
  win.webContents.on("did-finish-load", () => { if (!shown) win.webContents.send("win:visible", false); });

  win.on("minimize", () => { if (busy() && state.prefs.pillOnMinimise) openPill(); });
  win.on("close", (e) => {
    if (quitting || !busy()) return;
    // during a flight or layover, closing keeps SkyFocus running in the tray
    e.preventDefault();
    win.hide();
    if (state.prefs.pillOnMinimise) openPill();
    if (!state.closeHintShown) {
      state.closeHintShown = true; saveState();
      notify("SkyFocus is still flying", "The flight continues in the tray. Quit from the tray menu to stop it.");
    }
  });
  win.on("closed", () => { win = null; });
  ["blur", "focus", "minimize", "restore", "show", "hide"].forEach((ev) => win.on(ev, recheck));

  // F11 toggles fullscreen; Esc leaves it (the app still sees Esc)
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (input.key === "Escape" && win.isFullScreen()) win.setFullScreen(false);
  });
}
let rememberTimer = null;
function rememberWindow() {
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    state.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    saveState();
  }, 400);
}
function showMain() {
  if (!win) createMain();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function busy() { return snap.kind === "flight" || snap.kind === "layover"; }

/* ---------- presence: is SkyFocus (or its pill) in front, and is it on screen at all ---------- */
function checkFocus() {
  const s = !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
  if (s !== shown) { shown = s; if (win && !win.isDestroyed()) win.webContents.send("win:visible", s); }
  const f = BrowserWindow.getFocusedWindow();
  const p = {
    focused: !!f && (f === win || f === pillWin),
    visible: !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) || !!(pillWin && !pillWin.isDestroyed() && pillWin.isVisible())
  };
  if (p.focused === presence.focused && p.visible === presence.visible) return;
  presence = p;
  if (win && !win.isDestroyed()) win.webContents.send("app:presence", p);
}
const recheck = () => setTimeout(checkFocus, 80);

/* ---------- the mini pill ---------- */
function workAreaFor(b) { return screen.getDisplayMatching(b).workArea; }
function defaultPillPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - PILL.w - 16, y: wa.y + wa.height - PILL.h - 16 };
}
function openPill() {
  if (pillWin) { if (!pillWin.isVisible()) pillWin.showInactive(); return; }
  let pos = TEST ? { x: -5000, y: 0 } : state.pill || defaultPillPos();
  const wa = workAreaFor({ x: pos.x, y: pos.y, width: PILL.w, height: PILL.h });
  if (!TEST) pos = { x: Math.min(Math.max(pos.x, wa.x), wa.x + wa.width - PILL.w), y: Math.min(Math.max(pos.y, wa.y), wa.y + wa.height - PILL.h) };
  pillWin = new BrowserWindow({
    x: pos.x, y: pos.y, width: PILL.w, height: PILL.h, frame: false, transparent: true, resizable: false, maximizable: false,
    minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    backgroundColor: "#00000000", title: "SkyFocus pill", icon: ICON, webPreferences: prefsFor("pill-preload.js")
  });
  pillWin.setAlwaysOnTop(true, "floating");
  pillWin.setVisibleOnAllWorkspaces(true);
  guard(pillWin.webContents);
  if (TEST) pillWin.webContents.setAudioMuted(true);
  pillWin.loadURL(ORIGIN + "/desktop/pill.html");
  pillWin.once("ready-to-show", () => { pillWin.showInactive(); applyClickThrough(); pushPill(); });
  if (process.env.SKYFOCUS_PILL_EXEC) pillWin.webContents.once("did-finish-load", () => setTimeout(() => pillWin && pillWin.webContents.executeJavaScript(process.env.SKYFOCUS_PILL_EXEC, true).catch(() => {}), 600));
  ["blur", "focus", "show", "hide"].forEach((ev) => pillWin.on(ev, recheck));
  pillWin.on("closed", () => { pillWin = null; pillWide = false; recheck(); });
}
function closePill() { if (pillWin) pillWin.close(); }
function applyClickThrough() {
  if (!pillWin) return;
  if (state.prefs.pillClickThrough) pillWin.setIgnoreMouseEvents(true, { forward: true });
  else pillWin.setIgnoreMouseEvents(false);
  pillWin.webContents.send("pill:prefs", state.prefs);
}
function pushPill() { if (pillWin && !pillWin.isDestroyed()) pillWin.webContents.send("pill:state", snap); }
let pillWide = false;
function pillHover(on) {
  if (!pillWin) return;
  if (state.prefs.pillClickThrough) pillWin.setIgnoreMouseEvents(!on, { forward: true });
  if (on === pillWide) return;
  pillWide = on;
  const b = pillWin.getBounds(), wa = workAreaFor(b);
  const growLeft = b.x + PILL.wide > wa.x + wa.width;   // near the right edge, open toward the left
  const w = on ? PILL.wide : PILL.w;
  pillWin.setBounds({ x: growLeft ? b.x + b.width - w : b.x, y: b.y, width: w, height: PILL.h });
  pillWin.webContents.send("pill:side", growLeft ? "left" : "right");
}
let dragFrom = null;
function pillDrag(type, d) {
  if (!pillWin) return;
  if (type === "start") { dragFrom = pillWin.getBounds(); return; }
  if (type === "move" && dragFrom) { pillWin.setPosition(Math.round(dragFrom.x + d.dx), Math.round(dragFrom.y + d.dy)); return; }
  if (type === "end") {
    dragFrom = null;
    // snap to the edges and corners of the work area
    const b = pillWin.getBounds(), wa = workAreaFor(b), M = 12, S = 40;
    let x = b.x, y = b.y;
    if (Math.abs(b.x - wa.x) < S) x = wa.x + M;
    if (Math.abs(wa.x + wa.width - (b.x + b.width)) < S) x = wa.x + wa.width - b.width - M;
    if (Math.abs(b.y - wa.y) < S) y = wa.y + M;
    if (Math.abs(wa.y + wa.height - (b.y + b.height)) < S) y = wa.y + wa.height - b.height - M;
    x = Math.min(Math.max(x, wa.x), wa.x + wa.width - b.width); y = Math.min(Math.max(y, wa.y), wa.y + wa.height - b.height);
    pillWin.setPosition(x, y);
    state.pill = { x: pillWide && b.width === PILL.wide && x + PILL.wide > wa.x + wa.width - 1 ? x + PILL.wide - PILL.w : x, y: y };
    saveState();
  }
}

/* ---------- notifications, tray and taskbar ---------- */
function testLog(line) { if (process.env.SKYFOCUS_LOG) fs.appendFileSync(process.env.SKYFOCUS_LOG, "host " + line + require("os").EOL); }
function notify(title, body) {
  if (TEST) { testLog("notify " + title + " | " + body); return; }   // test runs stay off the user's screen
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: title, body: body, icon: ICON, silent: false });
  n.on("click", showMain);
  n.show();
}
function fmtLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? h + "h " + String(m).padStart(2, "0") + "m" : String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}
function trayMenu() {
  const flying = snap.kind === "flight";
  return Menu.buildFromTemplate([
    { label: "Show SkyFocus", click: showMain },
    { label: "Show pill", click: openPill },
    { type: "separator" },
    { label: snap.holding ? "Resume" : "Hold", enabled: flying, click: () => command({ type: "hold" }) },
    { label: "Divert", enabled: flying, click: confirmDivert },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } }
  ]);
}
async function confirmDivert() {
  const r = await dialog.showMessageBox(win && win.isVisible() ? win : null, {
    type: "question", buttons: ["Divert", "Keep flying"], defaultId: 1, cancelId: 1, title: "Divert flight",
    message: "Divert " + (snap.from || "") + " to " + (snap.to || "") + "?", detail: "The flight is logged as diverted with the distance flown so far. No stamp is issued."
  });
  if (r.response === 0) command({ type: "divert" });
}
function createTray() {
  if (TEST) return;
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icons", "tray.png")));
  tray.setToolTip("SkyFocus");
  tray.setContextMenu(trayMenu());
  tray.on("click", showMain);
}
let lastTrayKey = "", lastTip = "", shellTip = null, shellBar = null;
function updateShell() {
  // tray tooltip and menu
  let tip = "SkyFocus";
  if (snap.kind === "flight") tip = snap.from + " to " + snap.to + " · " + fmtLeft(snap.remainingMs) + " left" + (snap.holding ? " · holding" : "");
  else if (snap.kind === "layover") tip = "Layover at " + snap.at + " · " + fmtLeft(snap.remainingMs) + " left";
  if (TEST && tip !== lastTip) { lastTip = tip; if (!/\d\d:\d\d|\dh/.test(tip) || Math.random() < .1) testLog("tray " + tip + " | progress " + (snap.progress || 0).toFixed(3) + (snap.holding ? " paused" : "")); }
  if (tray && tip !== shellTip) { shellTip = tip; tray.setToolTip(tip); }
  if (tray) {
    const key = snap.kind + (snap.holding ? "h" : "");
    if (key !== lastTrayKey) { lastTrayKey = key; tray.setContextMenu(trayMenu()); }
  }
  // taskbar progress, paused while holding
  if (win && !win.isDestroyed()) {
    const bar = snap.kind === "flight" ? [Math.max(.01, snap.progress), snap.holding ? "paused" : "normal"]
      : snap.kind === "layover" ? [Math.max(.01, snap.progress), "normal"] : [-1, ""];
    const key = bar.join("|");
    if (key !== shellBar) { shellBar = key; if (bar[0] < 0) win.setProgressBar(-1); else win.setProgressBar(bar[0], { mode: bar[1] }); }
  }
}
function command(c) {
  if (c.type === "expand") { showMain(); return; }
  if (c.type === "closePill") { closePill(); return; }
  if (win && !win.isDestroyed()) win.webContents.send("app:command", c);
  if (c.type === "book") showMain();
}

/* ---------- IPC ---------- */
function fromMain(e) { return win && e.sender === win.webContents; }
function fromPill(e) { return pillWin && e.sender === pillWin.webContents; }
ipcMain.on("win:minimize", (e) => { if (fromMain(e)) win.minimize(); });
ipcMain.on("win:toggleMaximize", (e) => { if (fromMain(e)) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on("win:toggleFullscreen", (e) => { if (fromMain(e)) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on("win:close", (e) => { if (fromMain(e)) win.close(); });
ipcMain.on("pill:open", (e) => { if (fromMain(e)) openPill(); });
ipcMain.on("pill:close", (e) => { if (fromMain(e) || fromPill(e)) closePill(); });
ipcMain.on("app:state", (e, s) => {
  if (!fromMain(e) || !s || typeof s !== "object") return;
  snap = s;
  pushPill();
  updateShell();
});
ipcMain.on("app:event", (e, ev) => {
  if (!fromMain(e) || !ev) return;
  if (ev.type === "landed" && win && !win.isFocused()) win.flashFrame(true);
  if (ev.notify && ev.title) notify(String(ev.title).slice(0, 120), String(ev.body || "").slice(0, 240));
  if (pillWin) pillWin.webContents.send("pill:event", ev);
});
ipcMain.on("pill:command", (e, c) => { if (fromPill(e) && c && typeof c.type === "string") command(c); });
ipcMain.on("pill:hover", (e, on) => { if (fromPill(e)) pillHover(!!on); });
ipcMain.on("pill:drag", (e, type, d) => { if (fromPill(e)) pillDrag(type, d || {}); });
ipcMain.on("pill:ready", (e) => { if (fromPill(e)) { pushPill(); applyClickThrough(); } });
ipcMain.handle("prefs:get", (e) => (fromMain(e) || fromPill(e)) ? Object.assign({ version: app.getVersion() }, state.prefs) : null);
ipcMain.handle("prefs:set", (e, p) => {
  if (!fromMain(e) || !p) return null;
  ["pillOnMinimise", "pillClickThrough", "launchAtStartup"].forEach((k) => { if (k in p) state.prefs[k] = !!p[k]; });
  app.setLoginItemSettings({ openAtLogin: state.prefs.launchAtStartup, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath });
  saveState();
  applyClickThrough();
  return state.prefs;
});
ipcMain.handle("data:openFolder", (e) => { if (fromMain(e)) return shell.openPath(app.getPath("userData")); });
ipcMain.handle("data:backup", (e, json) => {
  if (!fromMain(e) || typeof json !== "string" || json.length > 50e6) return null;
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "skyfocus-backup-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".json");
  fs.writeFileSync(file, json);
  return file;
});
// app data file: written atomically (temp file, then rename) the moment the app saves
const DATA_FILE = () => path.join(app.getPath("userData"), "skyfocus-data.json");
// The app page, recognised by its address (any window showing index.html, never the pill), so the data
// file is never refused because the sender is not the exact window object the main process expected.
function fromApp(e) {
  if (pillWin && !pillWin.isDestroyed() && e.sender === pillWin.webContents) return false;
  const f = e.senderFrame;
  return !!f && f.url.startsWith(ORIGIN + "/index.html");
}
// A short log of data file problems, kept next to the data (at most about 64 KB).
function diag(line) {
  try {
    const f = path.join(app.getPath("userData"), "skyfocus-diag.log");
    try { if (fs.statSync(f).size > 64000) fs.renameSync(f, f + ".old"); } catch (err) { /* no log yet */ }
    fs.appendFileSync(f, new Date().toISOString() + " " + line + require("os").EOL);
  } catch (err) { /* nowhere to write */ }
}
function senderInfo(e) {
  return "sender " + e.sender.id + " win " + (win && !win.isDestroyed() ? win.webContents.id : "none") + " url " + (e.senderFrame ? e.senderFrame.url : "?");
}
ipcMain.on("data:load", (e) => {
  if (!fromApp(e)) { diag("load refused: " + senderInfo(e)); e.returnValue = null; return; }
  if (!fromMain(e)) diag("load from a window other than the main one: " + senderInfo(e));
  try { e.returnValue = fs.readFileSync(DATA_FILE(), "utf8") || null; }
  catch (err) { if (err.code !== "ENOENT") diag("load failed: " + err.code + " " + err.message); e.returnValue = null; }
});
let saveRefusals = 0;
ipcMain.on("data:save", (e, text) => {
  if (!fromApp(e)) { if (saveRefusals++ < 3) diag("save refused: " + senderInfo(e)); return; }
  if (typeof text !== "string" || text.length > 50e6) return;
  try {
    if (!text) { fs.rmSync(DATA_FILE(), { force: true }); return; }
    const tmp = DATA_FILE() + ".tmp";
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, DATA_FILE());
  } catch (err) { diag("save failed: " + err.code + " " + err.message); /* localStorage still has a copy */ }
});
ipcMain.on("data:note", (e, line) => { if (fromApp(e) && typeof line === "string") diag("page: " + line.slice(0, 300)); });
// YPT link: two MacroDroid webhook URLs, kept here and never in the app data, so exports and backups
// cannot carry them. The page asks for "start" or "stop"; the request runs here, outside the page CSP.
function yptLink() { return Object.assign({ startUrl: "", stopUrl: "", last: "stop" }, state.ypt); }
async function yptSend(kind) {
  const link = yptLink(), url = kind === "start" ? link.startUrl : link.stopUrl;
  if (!/^https:\/\//i.test(url)) return { ok: false, error: "No " + kind + " link set" };
  let res;
  if (TEST) { testLog("ypt " + kind); res = { ok: true, status: 200 }; }   // test runs never reach the phone
  else {
    try {
      const r = await net.fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(8000) });
      res = { ok: r.ok, status: r.status, error: r.ok ? "" : "HTTP " + r.status };
    } catch (err) { res = { ok: false, error: err.name === "TimeoutError" ? "No answer in 8 s" : "No connection" }; }
  }
  if (res.ok) { state.ypt = Object.assign(link, { last: kind }); saveStateNow(); }
  return res;
}
ipcMain.handle("ypt:get", (e) => fromMain(e) ? yptLink() : null);
ipcMain.handle("ypt:set", (e, u) => {
  if (!fromMain(e) || !u) return null;
  const clean = (s) => { s = String(s || "").trim(); return /^https:\/\/\S+$/i.test(s) && s.length < 2000 ? s : ""; };
  state.ypt = Object.assign(yptLink(), { startUrl: clean(u.startUrl), stopUrl: clean(u.stopUrl) });
  saveStateNow();
  return yptLink();
});
ipcMain.handle("ypt:send", (e, kind) => (fromMain(e) && (kind === "start" || kind === "stop")) ? yptSend(kind) : null);
// glass refraction maps cached between launches (rebuilt on demand if this file is missing)
const GLASS_FILE = () => path.join(app.getPath("userData"), "glass-maps.json");
ipcMain.on("glass:load", (e) => {
  if (!fromMain(e)) { e.returnValue = null; return; }
  try { e.returnValue = fs.readFileSync(GLASS_FILE(), "utf8") || null; } catch (err) { e.returnValue = null; }
});
ipcMain.on("glass:save", (e, text) => {
  if (!fromMain(e) || typeof text !== "string" || text.length > 3e6) return;
  fs.promises.writeFile(GLASS_FILE() + ".tmp", text).then(() => fs.promises.rename(GLASS_FILE() + ".tmp", GLASS_FILE())).catch(() => { /* only a cache */ });
});
ipcMain.handle("app:firstRun", (e) => fromMain(e) ? !state.firstRunDone : false);
ipcMain.on("app:firstRunDone", (e) => { if (fromMain(e)) { state.firstRunDone = true; saveState(); } });

/* ---------- test hooks (environment variables only; nothing here is reachable from the page) ----------
   SKYFOCUS_QUERY  appended to the start URL, e.g. ?dev=1&demo=window
   SKYFOCUS_EXEC   JavaScript run in the main window after load
   SKYFOCUS_SHOT   path for a PNG of the main window (and SKYFOCUS_SHOT.pill.png when the pill is open)
   SKYFOCUS_LOG    path for the console log of both windows
   SKYFOCUS_WAIT   milliseconds to wait before the capture (default 6000), then quit
   SKYFOCUS_OFFLINE  1 to run with the network disabled */
function testHooks() {
  const log = process.env.SKYFOCUS_LOG, NL = require("os").EOL;
  if (log) {
    const write = (who) => (e, level, msg, line, src) => {
      const d = e && e.message !== undefined ? e : { level: level, message: msg, lineNumber: line, sourceId: src };
      fs.appendFileSync(log, who + " [" + d.level + "] " + d.message + " (" + (d.sourceId || "") + ":" + (d.lineNumber || "") + ")" + NL);
    };
    app.on("browser-window-created", (e, w) => w.webContents.on("console-message", write(w === pillWin ? "pill" : "main")));
    if (win) win.webContents.on("console-message", write("main"));
  }
  if (process.env.SKYFOCUS_OFFLINE) {   // SKYFOCUS_OFFLINE=1: every network request fails, as with no connection
    win.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => cb({ cancel: true }));
  }
  // SKYFOCUS_HOST_CMDS="hold@3000;minimize@5000": the tray and window actions, at times after load
  (process.env.SKYFOCUS_HOST_CMDS || "").split(";").filter(Boolean).forEach((c) => {
    const [name, at] = c.split("@");
    setTimeout(() => {
      testLog("cmd " + name);
      if (name === "minimize") win.minimize();
      else if (name === "close") win.close();
      else if (name === "restore") showMain();
      else command({ type: name });
    }, +at || 0);
  });
  const shot = process.env.SKYFOCUS_SHOT;
  if (!shot && !process.env.SKYFOCUS_EXEC) return;
  win.webContents.once("did-finish-load", async () => {
    try {
      if (process.env.SKYFOCUS_EXEC) await win.webContents.executeJavaScript(process.env.SKYFOCUS_EXEC, true);
    } catch (e) { if (log) fs.appendFileSync(log, "exec error " + e.message + NL); }
    if (!shot) return;
    setTimeout(async () => {
      try {
        fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
        if (pillWin) fs.writeFileSync(shot.replace(/\.png$/, "") + ".pill.png", (await pillWin.webContents.capturePage()).toPNG());
      } catch (e) { if (log) fs.appendFileSync(log, "shot error " + e.message + NL); }
      quitting = true; app.quit();
    }, +(process.env.SKYFOCUS_WAIT || 6000));
  });
}

/* ---------- start ---------- */
// Quitting while YPT runs stops it first (up to 3 s), so the phone is not left counting.
let yptStopped = false;
app.on("before-quit", (e) => {
  quitting = true;
  if (yptStopped || yptLink().last !== "start") return;
  e.preventDefault();
  yptStopped = true;
  Promise.race([yptSend("stop"), new Promise((r) => setTimeout(r, 3000))]).finally(() => app.quit());
});
app.on("window-all-closed", () => { if (quitting) app.quit(); });
app.whenReady().then(() => {
  loadState();
  serve();
  createMain();
  createTray();
  testHooks();
});
