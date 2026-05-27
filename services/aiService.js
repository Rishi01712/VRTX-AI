// @ts-check

const ollamaModule = require("ollama");
const ollama = new ollamaModule.Ollama({ host:"http://127.0.0.1:11434"});
const { findRelevantFiles, readFileTool,getWorkspaceTree} = require("./fileService");
const { loadChatHistory} = require("./memoryService");
const { buildMultiFileContext } = require("./MultipleFileService");
const {modifyFileTool} = require("./editService")
const {extractRelevantSnippet} = require("./snippetService");

/**
 * @param {string} prompt
 * @param {(chunk: string) => void} onChunk 
 */
async function askAIBackend(prompt,onChunk) {

    try {
        console.log("USER:", prompt);
        const needsTools =/\b(\w+\.(py|js|ts|cpp|java)|workspace|folder|tree|modify|replace|edit|compare|read_file|project structure|workspace structure)\b/i.test(prompt);
        if (!needsTools) {
            const fastStream =await ollama.chat({
                model:
                    "qwen2.5-coder:latest",
                messages: [
                    {
                        role:"system",
                        content:
                            `
                            You are VRTX AI,
                            a fast and professional AI coding assistant.
                            `
                    },

                    {
                        role: "user",
                        content:
                            prompt
                    }
                ],
                stream: true,

                options: {
                    temperature: 0.2,
                    top_p: 0.8,
                    num_ctx: 1024
                }
            });

            for await (const part of fastStream) {
                const chunk =String(part.message.content ?? "");
                onChunk(chunk);
            }
            return;
        }

        const systemPrompt =
            `
            You are VRTX AI,
            a fast and professional AI coding assistant
            inside VS Code.

            Tasks:
            - write code
            - debug errors
            - explain code
            - optimize algorithms
            - analyze projects
            - refactor systems

            Rules:
            - Be concise and technical.
            - Avoid unnecessary introductions.
            - Prefer direct answers.
            - Use markdown formatting.
            - Wrap code in fenced code blocks.
            - Mention the programming language.
            - Prefer production-ready code.
            - Prioritize readability and performance.
            - Never ask users to paste files manually.
            - Use tools whenever file inspection is needed.
            - NEVER fabricate file contents.
            - ALWAYS use tools for workspace requests.
            - NEVER answer project/file questions without tools.
            - NEVER trust previous assistant responses for workspace state.
            - ALWAYS use tools again for file, folder, or project questions.
            - Workspace state may change at any time.
            - Do not assume folders/files exist from memory alone.

            When using tools:
            - NEVER write raw JSON in assistant responses.
            - ALWAYS use native tool calls only.
            - Do not manually print tool arguments.

            When modifying files:

            - For changing a single line or variable:
            ALWAYS use operation="replace"

            - For changing repeated text:
            use operation="replace_all"

            - For inserting code:
            use insert_before or insert_after

            - For replacing an entire function:
            use replace_function

            - replace_between
            ONLY for large multi-line code sections
            using startAnchor and endAnchor.

            - NEVER rewrite entire files for small edits.

            - NEVER replace large unrelated blocks when a small replace operation is enough.

            For single-line variable edits:
            ALWAYS prefer operation="replace"

            Do NOT use:
            - replace_function
            - replace_between

            unless multiple lines/functions are explicitly requested.

            Examples:

            GOOD:
            replace:
            target="arr = [1,2,3]"
            newText="arr = [4,5,6]"

            BAD:
            replace_between entire function for changing one variable.

            For replace operations:

            target = the EXISTING text currently inside the file.
            newText = the NEW replacement text.


            Use the modify_file tool correctly.

            For replace operations:
            - target = EXISTING text
            - newText = NEW replacement text

            Never swap them.
            NEVER swap target and newText.

            For operation="replace":
            - ONLY use:
            path
            operation
            target
            newText

            Do not include:
            - startAnchor
            - endAnchor
            - functionName

            unless operation explicitly requires them.
            `;

        
        const tokens = prompt.toLowerCase().match(/[a-zA-Z0-9_.-]+/g) || [];

        let matchedFiles = [];
        for (const token of tokens) {
            const files = await findRelevantFiles(token);
            if (files.length > 0) {
                matchedFiles.push(...files);
            }
        }

        matchedFiles = [...new Set(matchedFiles)];
        console.log("Matched Files:", matchedFiles);

        const isEditRequest =/\b(replace|modify|update|edit|refactor)\b/i.test(prompt)||
        (/\b(change|add|remove|delete)\b/i.test(prompt) && matchedFiles.length > 0);

        let fileContent = null;
        if (isEditRequest && matchedFiles.length > 0){
            fileContent =readFileTool({path: matchedFiles[0]});
        }

        const safeFileContent =fileContent?.success? (fileContent.content ||""): "";
        const relevantSnippet =extractRelevantSnippet(safeFileContent,prompt);
        
        let groundedEditPrompt = "";
        if (isEditRequest &&fileContent?.success) {
            groundedEditPrompt = 
                `
                You are modifying a REAL code file.

                USER REQUEST:
                ${prompt}

                FILE PATH:
                ${matchedFiles[0]}

                RELEVANT CODE SNIPPET:
                \`\`\`
                ${relevantSnippet}
                \`\`\`

                Your task:
                1. Understand the requested edit.
                2. Find the MOST relevant existing code.
                3. Generate a PRECISE patch tool call.
                4. Prefer:
                - replace
                - replace_function
                - insert_after
                - insert_before

                5. NEVER rewrite unrelated code.
                6. NEVER rewrite entire files for small edits.
                7. target MUST contain EXISTING code from file.
                8. newText MUST contain NEW replacement code.
                `;
        }
        const projectRequest =/\b(project|workspace|structure|architecture|folders|tree|codebase)\b/i.test(prompt);
        let workspaceTree = "";
        if (projectRequest) {
            workspaceTree = getWorkspaceTree();
        }

        let contextualPrompt =prompt;
        if (projectRequest) {
            contextualPrompt =
                `
                WORKSPACE TREE

                ${workspaceTree}

                USER REQUEST:
                ${prompt}
                `;
        }

        else {
            const multiFileContext = await buildMultiFileContext(prompt);
            if (multiFileContext) {
                contextualPrompt =multiFileContext;
            }

            else if (matchedFiles.length > 0) {
                contextualPrompt =
                    `
                    CANDIDATE WORKSPACE FILES:

                    ${matchedFiles.join("\n")}

                    USER REQUEST:
                    ${prompt}

                    IMPORTANT:
                    - Use the read_file tool if needed.
                    - Multiple files may be relevant.
                    `;
            }
        }
        
        const followUpRequest = /\b(it|this|that|previous|above|earlier|same)\b/i.test(prompt);
        const history =followUpRequest? loadChatHistory().slice(-4): [];

        /** @type {any[]} */
        const messages = [
            {
                role: "system",
                content:
                    systemPrompt
            },
            ...history,

            {
                role: "user",
                content:
                    (isEditRequest && fileContent?.success)
                    ? groundedEditPrompt: contextualPrompt
            }
        ];

        let iterations = 0;
        const maxIterations = 10;
        while (iterations < maxIterations) {
            iterations++;

            const response = await ollama.chat({
                    model:
                        "qwen3.5:0.8b",

                    messages,
                    stream: false,
                    tools: [

                        {
                            type: "function",
                            function: {

                                name:
                                    "read_file",

                                description:
                                    "Read a file from the VS Code workspace",

                                parameters: {
                                    type: "object",

                                    properties: {

                                        path: {

                                            type: "string",

                                            description:
                                                "File path to read"
                                        }
                                    },
                                    required:["path"]
                                }
                            }
                        },

                        {
                            type: "function",

                            function: {
                                name:
                                    "get_workspace_tree",
                                description:
                                    `
                                    Get the complete VS Code workspace hierarchy,
                                    including folders, subfolders, and files.

                                    Use this tool when users ask about:
                                    - project structure
                                    - architecture
                                    - workspace layout
                                    - folder organization
                                    - codebase hierarchy
                                    - modules
                                    - tree structure

                                    This tool helps plan multi-file exploration.
                                    `,

                                parameters: {
                                    type: "object",
                                    properties: {},
                                    required: []
                                }
                            }
                        },

                        {
                            type: "function",

                            function: {
                                name: 
                                    "modify_file",
                                description:
                                `
                                    Modify files using targeted edits.

                                    Operations:
                                    - replace
                                    - replace_all
                                    - insert_before
                                    - insert_after
                                    - delete
                                    - append
                                    - prepend
                                    - replace_function
                                    - replace_between

                                    Use small precise edits.
                                    `,

                                parameters: {
                                    type: "object",

                                    properties: {
                                        path: {
                                            type: "string"
                                        },
                                        operation: {
                                            type: "string"
                                        },
                                        target: {
                                            type: "string"
                                        },
                                        newText: {
                                            type: "string"
                                        },
                                        functionName: {
                                            type: "string"
                                        },
                                        startAnchor: {
                                            type: "string"
                                        },
                                        endAnchor: {
                                            type: "string"
                                        },
                                        occurrence: {
                                            type:"string",
                                            enum:["first","last","all"]
                                        }
                                    },
                                    required: ["path","operation"]
                                }
                            }
                        }
                    ],

                    options: {
                        temperature: 0.2,
                        top_p: 0.8,
                        num_ctx: 4096
                    }
                });
                console.log("First Response:",
                    JSON.stringify(
                        response,
                        null,
                        2
                    )
                );

            let toolCalls = response.message.tool_calls || [];
            console.log("Tool Calls:",
                JSON.stringify(
                    toolCalls,
                    null,
                    2
                )
            );

            // if (toolCalls.length === 0 && response.message.content) {
            //     try {
            //         const cleaned = response.message.content
            //                 .replace(/```json/g, "")

            //                 .replace(/```/g, "")

            //                 .trim();

            //         const parsed = JSON.parse(cleaned);
            //         if (parsed.name && parsed.arguments) {
            //             toolCalls = [
            //                 {
            //                     function: {
            //                         name:
            //                             parsed.name,

            //                         arguments:
            //                             parsed.arguments
            //                     }
            //                 }
            //             ];
            //         }

            //     } catch {}
            // }

            if (toolCalls.length === 0) {
                const normalStream = await ollama.chat({
                        model:
                            "qwen2.5-coder:latest",

                        messages,
                        stream: true,

                        options: {
                            temperature: 0.2,
                            top_p: 0.8,
                            num_ctx: 4096
                        }
                    });

                for await (const part of normalStream) {
                    const chunk = String(part.message.content ?? "");
                    onChunk(chunk);
                }
                return;
            }

            messages.push(response.message);
            
            let shouldStop = false;
            for (const call of toolCalls) {
                if (call.function.name ==="read_file") {
                    const args = typeof call.function.arguments === "string"?
                    JSON.parse(call.function.arguments) : call.function.arguments;

                    const result = readFileTool(args);
                    console.log("Tool Result:",
                        JSON.stringify(
                            result,
                            null,
                            2
                        )
                    );

                    messages.push({

                        role: "tool",
                        tool_call_id: /** @type {any} */ (call).id,
                        content:
                            `
                            The read_file tool returned:
                            ${JSON.stringify(result)}
                            Now answer the original request.
                            `
                    });
                }

                if (call.function.name ==="get_workspace_tree") {
                    const tree =getWorkspaceTree();
                    messages.push({
                        role: "tool",
                        tool_call_id: /** @type {any} */ (call).id,
                        content:
                            `
                            Tool Result:

                            WORKSPACE TREE

                            ${tree}
                            `
                    });
                }

                if (call.function.name ==="modify_file") {
                    const args =typeof call.function.arguments === "string"? 
                    JSON.parse(call.function.arguments ) : call.function.arguments;

                    const result =modifyFileTool(args);
                    messages.push({

                        role: "tool",
                        tool_call_id: /** @type {any} */ (call).id,
                        content: JSON.stringify(result)
                    });
                    if (result.success) {shouldStop = true;}
                }

            }
            if (shouldStop) {break;}
        }

        messages.push({
            role: "system",
            content:
                `
                All requested tool operations are complete.
                Respond naturally to the user.
                Do not call more tools.
                `
        });

        const finalStream = await ollama.chat({
                model:
                    "qwen2.5-coder:latest",

                messages,
                stream: true,

                options: {
                    temperature: 0,
                    top_p: 0.8,
                    num_ctx: 4096
                }
            });
        
        for await (const part of finalStream) {
            const chunk = String(part.message.content ?? "");
            onChunk(chunk); 
        }

    } catch (err) {
        console.error("AI BACKEND ERROR:",err);
        onChunk( "\n\nAI backend failed.");
    }
}
module.exports = {askAIBackend};