const { askAIBackend } = require("../services/aiService");
const {appendMessage} = require("../services/memoryService");
/**
 * @param {import("vscode").WebviewView} webviewView
 */
function setupChatHandler( webviewView) {
    webviewView.webview.onDidReceiveMessage(
        /**
         * @param {{
         * command: string,
         * text: string
         * }} message
         */
        async (message) => {
            switch (message.command) {
                case "sendMessage":
                    appendMessage({role: "user",content: message.text});

                    let AIResponse = "";
                    await askAIBackend(
                        message.text,
                        /**
                         * @param {string} chunk
                         */
                        chunk => {
                            AIResponse += chunk;
                            webviewView.webview.postMessage({
                                command:
                                    "streamChunk",
                                text:
                                    chunk
                            });
                        }
                    );

                    appendMessage({role: "assistant",content: AIResponse});
                    webviewView.webview.postMessage({
                        command:
                            "streamEnd"
                    });
                    break;
            }
        }
    );
}
module.exports = { setupChatHandler };