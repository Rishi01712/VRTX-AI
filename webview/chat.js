// @ts-nocheck
/* eslint-disable */

const vscode = acquireVsCodeApi();
document.addEventListener( "DOMContentLoaded", () => {
        const messages = document.getElementById( "messages" );
        const input = document.getElementById( "input" );
        const sendBtn = document.getElementById("sendBtn");
        const chatList = document.getElementById("chatList");
        const newChatBtn = document.getElementById("newChatBtn");
        const sidebar = document.getElementById("sidebar");
        const sidebarToggle = document.getElementById("sidebarToggle");

        let currentAIMessage = null;
        let currentThreadId = null;
        let currentMarkdown = "";
        let currentStatus = "";
        let isGenerating = false;
        let statusMessage = null;
        let isShowingStatus = false;

        function enhanceCodeBlocks(container) {
            container.querySelectorAll("pre").forEach(pre => {
                if (pre.parentElement?.classList.contains( "codeBlockWrapper")) {
                    return;
                }
                const code = pre.querySelector("code");
                if (code) {
                    hljs.highlightElement(code);
                }
                const wrapper = document.createElement("div");
                wrapper.className = "codeBlockWrapper";
                const copyBtn = document.createElement("button");
                copyBtn.className = "copyBtn";
                copyBtn.innerText = "Copy";
                copyBtn.addEventListener("click",async () => {
                        try {
                            await navigator.clipboard.writeText(code?.innerText ?? "");
                            copyBtn.innerText ="Copied!";setTimeout(() => {copyBtn.innerText ="Copy";}, 2000);
                        } catch {
                            copyBtn.innerText = "Failed";
                        }
                    }
                );
                pre.parentNode.insertBefore(wrapper,pre);
                wrapper.appendChild(pre);
                pre.insertBefore(copyBtn,pre.firstChild);
            });
        }

        /**
         * @param {string} text
         * @param {string} type
         */
        function addMessage(text, type) {
            if (!messages) {
                return;
            }
             
            const div = document.createElement( "div" );
            const cssType = type === "assistant"? "ai": type;
            div.className ="message " + cssType;
            div.innerHTML = marked.parse( String(text ?? ""));
            messages.appendChild( div );

            enhanceCodeBlocks(div);
            const isNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 120;
            if(isNearBottom) {
                messages.scrollTop = messages.scrollHeight;
            }
        }

        function renderThreads(threads) {
            chatList.innerHTML = "";

            for (const thread of threads) {
                const item = document.createElement("div");
                item.className = "threadItem";
                item.innerText = thread.title;

                item.onclick = () => {
                    currentThreadId = thread.id;
                    vscode.postMessage({command: "loadThread",threadId: thread.id});
                    sidebar.classList.remove("open");
                };

                chatList.appendChild(item);
            }
        }

        /**
         * @param {string} chunk
         */
        function streamAIChunk(chunk) {
            
            if (!messages) {
                return;
            }
            
            if (statusMessage) {
                statusMessage.remove();
                statusMessage = null;
            }

            if (!currentAIMessage) {
                currentAIMessage =document.createElement("div");
                currentAIMessage.className ="message ai";

                messages.appendChild(currentAIMessage);
                currentMarkdown = "";
            }

            const statusMatch = chunk.match(/^__STATUS__(.*)$/s);
            if (statusMatch) {

                const status = chunk.replace(/^__STATUS__/, "");
                if (!statusMessage) {
                    statusMessage = document.createElement("div");
                    statusMessage.className = "message status";
                    messages.appendChild(statusMessage);
                }

                statusMessage.textContent = status;
                return;
            }

            if (isShowingStatus) {
                isShowingStatus = false;
                currentMarkdown = "";
                currentAIMessage.innerHTML = "";
            }

            if (chunk.startsWith("__STATUS__")) {
                return;
            }
            
            currentMarkdown += chunk;
            currentAIMessage.innerHTML =marked.parse(currentMarkdown);
            console.log(currentAIMessage.innerHTML);
            enhanceCodeBlocks(currentAIMessage);

            const isNearBottom =messages.scrollHeight -messages.scrollTop -messages.clientHeight <120;
            if (isNearBottom) {
                messages.scrollTop =messages.scrollHeight;
            }
        }

        function setGeneratingState(generating) {
            isGenerating =generating;
            if (!sendBtn || !input) {
                return;
            }
            if (generating) {
                sendBtn.innerHTML ="Generating...";
                sendBtn.disabled = true;
                sendBtn.classList.add("loading");
            } else {
                sendBtn.innerHTML = "Send";
                sendBtn.disabled = false;
                sendBtn.classList.remove("loading");
            }
        }

        function sendMessage() {
            if (!input) {
                return;
            }
            const text = String( input.value ?? "" ).trim();
            if (!text) {
                return;
            }

            currentAIMessage = null;
            currentMarkdown = "";
            addMessage( text, "user" );

            
            setGeneratingState(true);
            vscode.postMessage({ command: "sendMessage", text: text });

            input.value = "";
        }

        if (input) {
            input.addEventListener( "keydown", e => {
                    if ( e.key === "Enter" && !e.shiftKey && !isGenerating) {
                        e.preventDefault();
                        sendMessage();
                    }
                }
            );
        }

        if (sendBtn) {
            sendBtn.addEventListener("click", () => {sendMessage();});
        }

        if(newChatBtn){
            newChatBtn?.addEventListener("click",() => {
                vscode.postMessage({command:"newThread"});
            });
        }

        if (sidebarToggle) {
            sidebarToggle.addEventListener("click",() => {
                sidebar.classList.toggle("open");
            });
        }

        window.addEventListener( "message", event => {
                const message =  event.data;

                switch ( message.command  ) {

                    case "streamChunk": streamAIChunk( String( message.text ?? "" ));
                        break;

                    case "streamEnd":
                        if (statusMessage) {
                            statusMessage.remove();
                            statusMessage = null;
                        }
                        currentStatus = "";
                        currentAIMessage = null;
                        currentMarkdown = "";
                        setGeneratingState(false);
                        break;
                    
                    case "threads":
                        message.data.sort((a, b) =>
                            new Date(b.updatedAt) - new Date(a.updatedAt)
                        );
                        renderThreads(message.data);
                        break;
                                        
                    case "threadData":
                        messages.innerHTML = "";
                        currentThreadId =message.data.id;
                        sidebar.classList.remove("open");

                        for (const msg of message.data.messages) {
                            addMessage(msg.content,msg.role);
                        }

                        break;
                    
                    case "threadCreated":
                        currentThreadId = message.threadId;
                        vscode.postMessage({command: "loadThread",threadId: message.threadId});
                        break;

                    case "error":
                        addMessage(String(message.text ?? ""),
                            "error"
                        );
                        break;
                }
            }
        );
        vscode.postMessage({command:"getThreads"});
    }
);