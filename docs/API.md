# BatBrowser Context Bridge API (`window.batBrowser`)

The main process exposes safe API bindings to renderer windows via `preload/browser.js`:

```javascript
window.batBrowser = {
  tab: { create(), close(), switch(), pin(), duplicate(), mute() },
  nav: { go(), back(), forward(), reload(), stop() },
  history: { get(), search(), clear(), deleteItem() },
  bookmarks: { get(), add(), remove(), update() },
  settings: { get(), set(), reset() },
  downloads: { get(), openFolder(), openFile(), cancel(), clear() },
  privacy: { clearCookies(), clearCache(), clearAll() }
}
```
