// Shared renderer-facing platform contract.
// Desktop delegates to the secure Electron preload bridge.
// Native wrappers (iPad/Capacitor) inject an implementation before app.js loads.
const injected = globalThis.sjaPlatform;
const bridge = globalThis.sjaDesktop;

if (!injected && !bridge) {
  throw new Error('SJA platform bridge is unavailable');
}

const desktopPlatform = bridge ? Object.freeze({
  kind: 'desktop',
  documents: bridge.documents,
  people: bridge.people,
  templates: bridge.templates,
  profile: bridge.profile,
  pdf: bridge.pdf,
  updates: bridge.updates,
  files: Object.freeze({ show: (filePath) => bridge.showFile(filePath) }),
  external: Object.freeze({ open: (url) => bridge.openExternal(url) })
}) : null;

export const platform = injected || desktopPlatform;
