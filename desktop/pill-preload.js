/* SkyFocus desktop: the bridge for the pill window. Only these functions reach the pill page. */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function listen(channel, cb) { ipcRenderer.on(channel, (e, data) => cb(data)); }

contextBridge.exposeInMainWorld("skyfocusPill", {
  command: (c) => ipcRenderer.send("pill:command", c),
  hover: (on) => ipcRenderer.send("pill:hover", !!on),
  drag: (type, d) => ipcRenderer.send("pill:drag", type, d),
  ready: () => ipcRenderer.send("pill:ready"),
  onState: (cb) => listen("pill:state", cb),
  onEvent: (cb) => listen("pill:event", cb),
  onPrefs: (cb) => listen("pill:prefs", cb),
  onSide: (cb) => listen("pill:side", cb)
});
