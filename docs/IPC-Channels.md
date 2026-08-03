# IPC Channels Reference

All IPC communications between Main and Renderer are declared in `src/core/Constants.js`.

## Tab Channels
- `tab:create` (Invoke) — Creates a new tab with specified URL.
- `tab:close` (Invoke) — Closes the tab by ID.
- `tab:switch` (Invoke) — Switches active view to tab ID.
- `tabs:updated` (Send) — Broadcasts serialized tab tree state.

## Navigation Channels
- `nav:go` (Invoke) — Navigates active tab to target URL/query.
- `nav:back` (Invoke) — Navigates active tab backward in history.
- `nav:forward` (Invoke) — Navigates active tab forward in history.
- `nav:reload` (Invoke) — Reloads active page.

## Settings & Stores
- `settings:get` (Invoke) — Fetches complete settings object.
- `settings:set` (Invoke) — Updates a specific setting key.
- `history:get` (Invoke) — Query browsing history logs.
- `bookmarks:get` (Invoke) — Retrieve bookmark folder tree.
