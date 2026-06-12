const { askAIBackend } = require("../services/aiService");
const {appendMessage} = require("../services/threadService");
const {createThread,loadThread,updateThreadTitle,setThread,getThread,getAllThreads} = require("../services/threadService");

/**
 * @param {import("vscode").WebviewView} webviewView
 */
function setupChatHandler( webviewView) {
    webviewView.webview.onDidReceiveMessage(
        /**
         * @param {{
         *   command: string,
         *   text?: string,
         *   threadId?: string
         * }} message
         */
        async (message) => {
            switch (message.command) {
                case "sendMessage":
                    const threadId = getThread();
                    if (!threadId) {return;}

                    const thread = await loadThread(threadId);

                    if (!threadId || !message.text) { break; }

                    const threads = await getAllThreads();

                    const meta = threads.find(
                        /** @param {{id:string,title:string}} t */
                        t => t.id === threadId
                    );
                    
                    console.log(thread);
                    if (thread.messages.length === 0 &&meta &&meta.title === "New Chat") {
                        const title = message.text.slice(0, 30).trim();

                        await updateThreadTitle(threadId,title);
                        webviewView.webview.postMessage({command: "threads",data: await getAllThreads()});
                    }

                    await appendMessage(threadId,{role:"user",content:message.text});

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

                    appendMessage(threadId,{role: "assistant",content: AIResponse.replace(/__STATUS__.*?(?=__STATUS__|$)/gs,"")});
                    webviewView.webview.postMessage({
                        command:
                            "streamEnd"
                    });
                    break;

                case "newThread": {
                    const id = await createThread("New Chat");
                    setThread(id);

                    const threads = await getAllThreads();
                    webviewView.webview.postMessage({command: "threads",data: threads});

                    webviewView.webview.postMessage({command: "threadCreated",threadId: id});
                    break;
                }

                case "loadThread": {
                    if (!message.threadId) {
                        break;
                    }

                    const thread =await loadThread( message.threadId);
                    setThread(message.threadId);

                    webviewView.webview.postMessage({command:"threadData",data:thread});
                    break;
                }
                
                case "getThreads": {
                    const threads = await getAllThreads();
                    webviewView.webview.postMessage({command:"threads",data:threads});
                    break;
                }
            }
        }
    );
}

module.exports = { setupChatHandler };