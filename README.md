# ERM Editor

A visual Entity-Relationship Model editor with MariaDB SQL export.
Available as a **standalone web app** (`index.html`) and as a **VS Code extension** (`erm-vscode/`).

## Features

- **Entities** — create, rename, drag freely on the canvas
- **Fields** — INT, UNSIGNED INT, VARCHAR, DATE, FLOAT, TEXT, BOOLEAN, BIGINT; PK / FK badges
- **FK references** — pick the referenced table and field inline when marking a field as FK
- **Relationships** — graphical 1:1 / 1:N / N:M with crow's foot notation
  - FK field auto-created on the correct side on confirm
  - N:M auto-creates a junction table with both FK columns
  - Click a relationship line to edit cardinality or delete it
  - Deleting a FK field from an entity automatically removes the relationship
- **SQL export** — MariaDB / MySQL `CREATE TABLE` statements with:
  - `PRIMARY KEY`, `FOREIGN KEY … ON DELETE RESTRICT ON UPDATE CASCADE`
  - `UNIQUE KEY` for 1:1 FK columns, `INDEX` for 1:N FK columns
  - `SET FOREIGN_KEY_CHECKS=0/1` wrapper
- **Save / Load** — JSON diagram files
- **Keyboard shortcuts** — `E` new entity, `R` relationship tool, `ESC` cancel

## Standalone usage

Open `index.html` directly in any browser — no server required.

## VS Code extension

```
erm-vscode/
├── package.json        ← extension manifest ("ERM Editor: Open" command)
├── extension.js        ← WebView panel + file I/O via VS Code API
└── media/
    ├── webview.html
    ├── style.css
    └── editor.js
```

**Run in development:**
1. Open `erm-vscode/` in VS Code
2. Press `F5` — Extension Development Host opens
3. Run `ERM Editor: Open` from the Command Palette

**Package for distribution:**
```bash
cd erm-vscode
npm install
npx vsce package
```

**VS Code vs standalone differences:**

| Action | Standalone | VS Code |
|---|---|---|
| Save diagram | Browser download | Native Save dialog → `.erm.json` |
| Load diagram | File input | Native Open dialog |
| Export SQL | Browser download | Writes `.sql`, opens in editor tab |

## Repository

https://github.com/kingma-sbw/erm-editor
