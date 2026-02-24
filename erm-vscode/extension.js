'use strict';

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('erm-editor.open', () => {
      ErmPanel.createOrShow(context);
    })
  );
}

class ErmPanel {
  static currentPanel = undefined;
  static viewType     = 'ermEditor';

  static createOrShow(context) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ErmPanel.currentPanel) {
      ErmPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ErmPanel.viewType,
      'ERM Editor',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        retainContextWhenHidden: true   // keep diagram alive when tab is not visible
      }
    );

    ErmPanel.currentPanel = new ErmPanel(panel, context);
  }

  constructor(panel, context) {
    this._panel        = panel;
    this._context      = context;
    this._lastSaveUri  = null;

    this._panel.webview.html = this._buildHtml();

    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMsg(msg), null, context.subscriptions
    );
    this._panel.onDidDispose(
      () => { ErmPanel.currentPanel = undefined; }, null, context.subscriptions
    );
  }

  async _handleMsg(msg) {
    const ws0 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    switch (msg.type) {

      case 'save': {
        const uri = await vscode.window.showSaveDialog({
          filters: { 'ERM Diagram': ['erm.json'] },
          defaultUri: this._lastSaveUri ??
            vscode.Uri.file(path.join(ws0, 'diagram.erm.json'))
        });
        if (!uri) return;
        this._lastSaveUri = uri;
        await vscode.workspace.fs.writeFile(
          uri, Buffer.from(JSON.stringify(msg.data, null, 2), 'utf8')
        );
        vscode.window.showInformationMessage(`ERM saved: ${path.basename(uri.fsPath)}`);
        break;
      }

      case 'load': {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'ERM Diagram': ['erm.json', 'json'] },
          canSelectMany: false
        });
        if (!uris?.length) return;
        try {
          const bytes = await vscode.workspace.fs.readFile(uris[0]);
          const data  = JSON.parse(Buffer.from(bytes).toString('utf8'));
          this._lastSaveUri = uris[0];
          this._panel.webview.postMessage({ type: 'load', data });
        } catch {
          vscode.window.showErrorMessage('Failed to parse ERM file.');
        }
        break;
      }

      case 'exportSQL': {
        const uri = await vscode.window.showSaveDialog({
          filters: { 'SQL File': ['sql'] },
          defaultUri: vscode.Uri.file(path.join(ws0, 'schema.sql'))
        });
        if (!uri) return;
        await vscode.workspace.fs.writeFile(uri, Buffer.from(msg.data, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        break;
      }
    }
  }

  _buildHtml() {
    const webview  = this._panel.webview;
    const mediaDir = vscode.Uri.joinPath(this._context.extensionUri, 'media');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'editor.js'));
    const styleUri  = webview.asWebviewUri(vscode.Uri.joinPath(mediaDir, 'style.css'));
    const nonce     = getNonce();

    const tpl = fs.readFileSync(
      path.join(this._context.extensionPath, 'media', 'webview.html'), 'utf8'
    );

    return tpl
      .replace(/\{\{nonce\}\}/g,      nonce)
      .replace(/\{\{cspSource\}\}/g,  webview.cspSource)
      .replace(/\{\{styleUri\}\}/g,   styleUri)
      .replace(/\{\{scriptUri\}\}/g,  scriptUri);
  }
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function deactivate() {}

module.exports = { activate, deactivate };
