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
  // desktop preferences and data
  getPrefs: () => ipcRenderer.invoke("prefs:get"),
  setPrefs: (p) => ipcRenderer.invoke("prefs:set", p),
  openDataFolder: () => ipcRenderer.invoke("data:openFolder"),
  backupNow: (json) => ipcRenderer.invoke("data:backup", json),
  isFirstRun: () => ipcRenderer.invoke("app:firstRun"),
  firstRunDone: () => ipcRenderer.send("app:firstRunDone")
});
