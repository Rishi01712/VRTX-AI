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
                            webviewView.webview.postMessage({
                                command: "streamChunk",
                                text: chunk
                            });

                            if (!chunk.startsWith("__STATUS__")) {
                                AIResponse += chunk;
                            }
                        }
                    );

                    appendMessage({role: "assistant",content: AIResponse.replace(/__STATUS__.*?(?=__STATUS__|$)/gs,"")});
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