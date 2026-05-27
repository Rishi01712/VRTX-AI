// @ts-check
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const {setupChatHandler} = require("./providers/chatProvider");
const { indexWorkspaceFiles } = require("./services/fileService");

/**
 * @param {vscode.Webview} webview
 * @param {vscode.ExtensionContext} context
 */
function getWebviewContent( webview, context ) {
    const htmlPath = path.join( context.extensionPath,"webview", "chat.html" );
    let html = fs.readFileSync(htmlPath,"utf8");
    const styleUri = webview.asWebviewUri( vscode.Uri.file(
                path.join(
                    context.extensionPath,
                    "webview",
                    "chat.css"
                )
            )
        );

    const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(
                path.join(
                    context.extensionPath,
                    "webview",
                    "chat.js"
                )
            )
        );

    html = html.replace("{{styleUri}}",styleUri.toString());
    html = html.replace("{{scriptUri}}",scriptUri.toString());
    return html;
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log("EXTENSION ACTIVATED");
    await indexWorkspaceFiles();
    const provider = {
        /**
         * @param {vscode.WebviewView} webviewView
         */
        resolveWebviewView(webviewView) {
            console.log( "OPENING WEBVIEW" );
            webviewView.webview.options = { enableScripts: true};
            webviewView.webview.html =
                getWebviewContent(
                    webviewView.webview,
                    context
                );
            setupChatHandler(webviewView);
        }
    };
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("zoho-ai.chatView",provider)
    );
}

function deactivate() {
    console.log("EXTENSION DEACTIVATED");
}

module.exports = { activate, deactivate };