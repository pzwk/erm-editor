# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A visual Entity-Relationship Model editor with MariaDB SQL export. Ships in two forms that must stay in sync:

- **Standalone web app** — `index.html` (self-contained, no build step)
- **VS Code extension** — `erm-vscode/` (WebView panel wrapping the same logic)

## Development

### Standalone app
Open `index.html` directly in a browser — no server or build step required.

### VS Code extension
1. Open `erm-vscode/` in VS Code
2. Press `F5` to launch an Extension Development Host
3. Run `ERM Editor: Open` from the Command Palette

**Package for distribution:**
```bash
cd erm-vscode
npm install
npx vsce package
```

There are no automated tests or a linter configured in this project.

## Architecture

### Dual-target sync rule
Every feature must be implemented in **both** targets:

| File | Role |
|---|---|
| `index.html` | Standalone — CSS + HTML + JS all in one file |
| `erm-vscode/media/webview.html` | VS Code HTML (mirrors `index.html` structure) |
| `erm-vscode/media/style.css` | VS Code styles (mirrors `index.html` `<style>`) |
| `erm-vscode/media/editor.js` | VS Code JS logic (mirrors `index.html` `<script>`) |
| `erm-vscode/extension.js` | Extension host — WebView panel + file I/O via VS Code API |

The JS in `editor.js` is nearly identical to the `<script>` block in `index.html`, with one key difference: `editor.js` uses `acquireVsCodeApi()` and posts messages to the extension host for Save/Load/Export SQL, whereas `index.html` uses browser APIs (download links, `FileReader`).

### State model
```js
let S = { entities: [], relationships: [] };
let uid = 1;
const id = () => uid++;
```

- **Entity**: `{ id, name, x, y, fields[] }`
- **Field**: `{ id, name, type, pk, fk, nn, refEnt, refField }`
- **Relationship**: `{ id, from, to, type }` — `from` = parent (1-side), `to` = child (N-side)

### Supported field types
`INT`, `UNSIGNED INT`, `VARCHAR(50)`, `VARCHAR(100)`, `VARCHAR(255)`, `DATE`, `TIMESTAMP`, `FLOAT`, `TEXT`, `BOOLEAN`, `BIGINT`

### TIMESTAMP SQL rules
- First TIMESTAMP in a table → `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- Subsequent TIMESTAMP fields → `NULL DEFAULT NULL`
- NN checkbox is hidden for TIMESTAMP fields in the field editor

### Relationship behaviour
- **1:N** — FK auto-added to the N-side (child) entity; `INDEX` in SQL
- **1:1** — FK auto-added to the child entity; `UNIQUE KEY` in SQL
- **N:M** — junction table auto-created with two FK columns
- Deleting a FK field from an entity automatically removes its relationship
- Clicking a relationship line opens an edit modal (change cardinality or delete)

### Canvas rendering
- Entities are absolutely-positioned `div.entity` elements inside `#canvas` (6000×6000 px)
- Relationship lines are drawn in `#svg-layer` (overlaid SVG, same size)
- Pan is implemented via CSS `transform: translate()` on `#canvas`
- `renderAll()` redraws all entities and relationship lines from state

## Workflow
- Create a feature branch per ticket (e.g. `feature/issue-1-description`), then open a PR targeting `main`
- PR body should reference the issue it closes (e.g. `Closes #1`)
- Never push directly to `main`
