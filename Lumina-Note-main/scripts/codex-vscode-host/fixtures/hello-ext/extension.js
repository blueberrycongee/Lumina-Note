"use strict";

exports.activate = async function activate() {
  const vscode = require("vscode");

  vscode.window.registerWebviewViewProvider("hello.view", {
    async resolveWebviewView(view) {
      view.webview.html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Hello</title>
  </head>
  <body>
    <script>
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ type: "hello", from: "webview" });
      window.addEventListener("message", (e) => {
        window.__lastMessage = e.data;
      });
    </script>
    <h1>Hello Webview</h1>
  </body>
</html>`;

      view.webview.onDidReceiveMessage((msg) => {
        view.webview.postMessage({ type: "echo", msg });
      });
    },
  });
};

