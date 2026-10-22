/* SkyFocus desktop: the bridge for the main window. Only these functions reach the page. */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function listen(channel, cb) {
  const fn = (e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

contextBridge.exposeInMainWorld("skyfocusDesktop", {
  // window controls
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggleMaximize"),
  toggleFullscreen: () => ipcRenderer.send("win:toggleFullscreen"),
  close: () => ipcRenderer.send("win:close"),
  onWindowState: (cb) => listen("win:state", cb),
  // mini pill
  openPill: () => ipcRenderer.send("pill:open"),
  closePill: () => ipcRenderer.send("pill:close"),
  // live flight state for the pill, tray and taskbar; events for notifications
  pushState: (s) => ipcRenderer.send("app:state", s),
  event: (ev) => ipcRenderer.send("app:event", ev),
  onCommand: (cb) => listen("app:command", cb),
  onPresence: (cb) => listen("app:presence", cb),
  onVisible: (cb) => listen("win:visible", cb),
  // desktop preferences and data
  getPrefs: () => ipcRenderer.invoke("prefs:get"),
  setPrefs: (p) => ipcRenderer.invoke("prefs:set", p),
  openDataFolder: () => ipcRenderer.invoke("data:openFolder"),
  backupNow: (json) => ipcRenderer.invoke("data:backup", json),
  isFirstRun: () => ipcRenderer.invoke("app:firstRun"),
  firstRunDone: () => ipcRenderer.send("app:firstRunDone"),
  // YPT link: the main process keeps the webhook URLs and makes the requests
  ypt: {
    get: () => ipcRenderer.invoke("ypt:get"),
    set: (urls) => ipcRenderer.invoke("ypt:set", urls),
    send: (kind) => ipcRenderer.invoke("ypt:send", kind)
  },
  // glass refraction map cache (a cache only: never the app data)
  glassMaps: {
    load: () => ipcRenderer.sendSync("glass:load"),
    save: (text) => ipcRenderer.send("glass:save", String(text))
  },
  // app data, kept in a file the main process writes at once
  storage: {
    load: () => ipcRenderer.sendSync("data:load"),
    save: (text) => ipcRenderer.send("data:save", String(text)),
    note: (line) => ipcRenderer.send("data:note", String(line))
  }
});
