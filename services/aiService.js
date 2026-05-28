// @ts-check

const ollamaModule = require("ollama");
const ollama = new ollamaModule.Ollama({host: "http://127.0.0.1:11434"});
const {findRelevantFiles,readFileTool,getWorkspaceTree} = require("./fileService");
const {loadChatHistory} = require("./memoryService");
const {buildMultiFileContext} = require("./MultipleFileService");
const {modifyFileTool} = require("./editService");
// const {extractRelevantSnippet} = require("./snippetService");
// const {extractEditIntent} = require("./intentService");
// const {buildPatch} = require("./patchService");

/**
 * @param {string} text
 */
function sanitizeGeneratedCode(text) {
    return text
        .replace(/```[a-zA-Z]*/g, "")
        .replace(/```/g, "")
        .replace(/^\d+:\s?/gm, "")
        .trim();
}

/**
 * @param {string} prompt
 */
function isFollowUp(prompt) {
    return /\b(it|this|that|same|previous|above|earlier)\b/i.test(prompt);
}

/**
 * @param {string} prompt
 */
function isWorkspaceRequest(prompt) {
    return /\b(workspace|project|structure|architecture|folders|hierarchy|tree|codebase)\b/i.test(prompt);
}

/**
 * @param {string} prompt
 */
function isEditRequest(prompt) {
    return /\b(modify|edit|replace|refactor|update|rewrite|remove|delete|insert|append|prepend|add|fix|change)\b/i.test(prompt);
}

/**
 * @param {string} prompt
 */
function shouldSearchFiles(prompt) {
    return /\b(file|js|ts|jsx|tsx|py|cpp|java|component|function|class|api|route|backend|frontend|module|auth|login|signup|database|server|client|bug|error|fix|modify|edit|replace|refactor|explain|analyze|workspace|project|structure|tree)\b/i.test(prompt);
}

/**
 * @param {any} args
 */
function safeParseArgs(args) {
    try {
        return typeof args === "string"? JSON.parse(args): args;
    } catch {
        return {};
    }
}

/**
 *
 * @param {string} prompt
 * @param {(chunk: string) => void} onChunk
 */
async function askAIBackend(prompt, onChunk) {
    try {
        console.log("USER:", prompt);
        const originalUserPrompt = prompt;

        const systemPrompt = `
            You are VRTX AI,
            a professional AI coding assistant inside VS Code.

            Capabilities:
            - answer coding questions
            - generate code
            - explain code
            - debug programs
            - analyze workspaces
            - inspect files
            - modify files
            - refactor systems

            General Rules:
            - Be concise and technical.
            - Prefer direct answers.
            - Use markdown formatting.
            - Wrap code inside fenced blocks.
            - Mention programming language names.
            - NEVER fabricate workspace contents.
            - ONLY use tools when required.
            - DO NOT use tools for normal conversations.
            - Preserve conversational continuity.

            Workspace Rules:
            - Use read_file for inspecting files.
            - Use get_workspace_tree for project structure.
            - Never assume workspace state from memory.
            - Always inspect real files when needed.

            When modifying files:
            - ALWAYS return complete updated file content.
            - NEVER return partial patches.
            - NEVER omit unrelated code.
            - ALWAYS call modify_file.
            - NEVER explain edits without tool calls.
            - NEVER return manual instructions instead of tool usage.
            `;

        const history = isFollowUp(prompt)? loadChatHistory().slice(-6): [];

        /** @type {string[]} */
        let matchedFiles = [];
        if (shouldSearchFiles(prompt)) {
            const tokens =prompt.toLowerCase().match(/[a-zA-Z0-9_.-/]+/g) || [];
            for (const token of tokens) {
                if (token.length < 3) {
                    continue;
                }

                if (["same","this","that","with","from","what","who"].includes(token)) {
                    continue;
                }

                const files =await findRelevantFiles(token);
                if (files.length > 0) {
                    matchedFiles.push(...files);
                }
            }
            matchedFiles =[...new Set(matchedFiles)];
        }

        console.log("Matched Files:",matchedFiles);

        let contextualPrompt = prompt;
        if (isWorkspaceRequest(prompt)) {
            const workspaceTree =getWorkspaceTree();

            contextualPrompt = `
                WORKSPACE TREE:

                ${workspaceTree}

                USER REQUEST:
                ${prompt}
            `;
        }

        else if (matchedFiles.length > 0) {
            const multiFileContext =await buildMultiFileContext(prompt);
            if (multiFileContext) {
                contextualPrompt =multiFileContext;
            } else {
                contextualPrompt = `
                    CANDIDATE FILES:

                    ${matchedFiles.join("\n")}

                    USER REQUEST:
                    ${prompt}

                    IMPORTANT:
                    - Use read_file if needed.
                    - Multiple files may be relevant.
                `;
            }
        }

        let finalUserPrompt =contextualPrompt;
        if (isEditRequest(prompt) && matchedFiles.length > 0) {
            const fileResult =readFileTool({path: matchedFiles[0]});

            if (fileResult?.success) {
                const fullFile =fileResult.content || "";

                finalUserPrompt = `
                    USER REQUEST:
                    ${prompt}

                    FULL FILE CONTENT:

                    \`\`\`
                    ${fullFile}
                    \`\`\`

                    IMPORTANT:
                    - Return ONLY tool calls.
                    - Rewrite the ENTIRE updated file.
                    - Preserve all unrelated code.
                    - Modify ONLY requested parts.
                    - Do NOT omit any code.
                `;
            }
        }

        /** @type {any[]} */
        const messages = [
            {
                role: "system",
                content: systemPrompt
            },

            ...history,

            {
                role: "user",
                content: finalUserPrompt
            }
        ];


// if (
//     isEditRequest(prompt) &&
//     matchedFiles.length > 0
// ) {

//     const intent =
//         extractEditIntent(prompt);

//     console.log(
//         "EDIT INTENT:",
//         intent
//     );

//     const fileResult =
//         readFileTool({
//             path:
//                 matchedFiles[0]
//         });

//     if (fileResult?.success) {

//         const patch =
//             buildPatch(
//                 fileResult.content || "",
//                 intent
//             );

//         console.log(
//             "PATCH:",
//             patch
//         );

//         if (patch.success && patch.operation && patch.target && patch.newText) {

//             const result =
//                 modifyFileTool({

//                     path:
//                         matchedFiles[0] || "",

//                     operation:
//                         patch.operation,

//                     target:
//                         patch.target,

//                     newText:
//                         patch.newText
//                 });

//             console.log(
//                 "PATCH RESULT:",
//                 result
//             );

//             onChunk(
//                 result.success
//                     ? "Updated successfully."
//                     : (result.error || "Modification Failed")
//             );

//             return;
//         }
//     }
// }

        const maxIterations = 10;

        let iteration = 0;
        while (iteration < maxIterations) {
            iteration++;

            const response =await ollama.chat({

                    model:
                        "qwen3.5:0.8b",
                    messages,
                    stream: false,
                    tools: [

                        {
                            type: "function",

                            function: {
                                name: "read_file",
                                description:
                                    "Read a workspace file",

                                parameters: {
                                    type: "object",
                                    properties: {
                                        path: {
                                            type: "string",
                                            description:
                                                "File path"
                                        }
                                    },
                                    required: ["path"]
                                }
                            }
                        },

                        {
                            type: "function",

                            function: {
                                name:
                                    "get_workspace_tree",
                                description:
                                    "Get workspace hierarchy",

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
                                name: "modify_file",
                                description:
                                    `
                                    Rewrite an entire file with updated content.

                                    IMPORTANT:
                                    - ALWAYS return the FULL updated file content.
                                    - NEVER return partial snippets.
                                    - Preserve unrelated code exactly.
                                    - Only modify requested parts.
                                    - Maintain formatting and indentation.
                                `,
                                parameters: {
                                    type: "object",
                                    properties: {
                                        path: {
                                            type: "string",
                                            description:
                                                "Path to the file to modify."
                                        }
                                    },
                                    required: ["path"]
                                }
                            }
                        }
                    ],

                    options: {
                        temperature: 0.2,
                        top_p: 0.8,
                        num_ctx: 16384
                    }
                });

            console.log(
                "MODEL RESPONSE:",
                JSON.stringify(
                    response,
                    null,
                    2
                )
            );

            let toolCalls =response.message.tool_calls || [];
            let parsedFallbackToolCall = false;

            console.log("ToolCalls:", JSON.stringify(toolCalls, null, 2) );

            if (toolCalls.length === 0 &&response.message.content) {
                try {
                    const cleaned = response.message.content.replace(/```json/g, "").replace(/```/g, "").trim();

                    let parsed = null;
                    try {
                        parsed = JSON.parse(cleaned);
                    } catch {
                        
                        try {
                            const fixed =cleaned.replace(/}\s*}+\s*$/, "}");
                            parsed = JSON.parse(fixed);
                        } catch {}
                    }

                    if (parsed.name &&parsed.arguments) {
                        parsedFallbackToolCall = true;
                        toolCalls = [
                            {
                                function: {
                                    name: parsed.name,
                                    arguments:
                                        parsed.arguments
                                }
                            }
                        ];
                    }

                } catch {}
            }
            
            if (toolCalls.length === 0 && !parsedFallbackToolCall) {
                break;
            }

            messages.push(response.message);

            // const requestedReadFiles =toolCalls.filter(t => t.function.name === "read_file").length;
            // let completedReadFiles = 0;

            for (const call of toolCalls) {
                console.log( "EXECUTING:", call.function.name );

                const toolName =call.function.name;
                const args =safeParseArgs(call.function.arguments);

                if (toolName === "read_file") {
                    const result =readFileTool(args);
                    // completedReadFiles++;

                    console.log("RESULT:", result);

                    messages.push({
                        role: "tool",
                        tool_call_id:
                            /** @type {any} */ (call).id,
                        content:
                            JSON.stringify(result)
                    });
                }

                else if (toolName ==="get_workspace_tree") {
                    const tree =getWorkspaceTree();
        
                        console.log("RESULT:", tree);

                    messages.push({
                        role: "tool",
                        tool_call_id:
                            /** @type {any} */ (call).id,
                        content:
                            `
                            WORKSPACE TREE:

                            ${tree}

                            IMPORTANT:
                            Preserve this exact tree formatting
                            in final response.
                            `
                    });
                }

                else if (toolName === "modify_file") {
                   const requestedPath =args.path || "";
                   const matchedPath =matchedFiles.find(file =>file.toLowerCase().endsWith(requestedPath.toLowerCase()));
                    if (matchedPath) {
                        args.path =matchedPath;
                    }else{
                        console.log("NO MATCHED FILE PATH FOUND");
                        continue;
                    }

                    const fileResult =readFileTool({path: args.path});

                    if (!fileResult?.success) {
                        console.log("FAILED TO READ FILE");
                        continue;
                    }

                    const rewriteResponse = await ollama.chat({
                    
                            model:
                                "qwen2.5-coder:latest",
                            messages: [
                                {
                                    role: "system",
                                    content:
                                        `
                                        You are an expert code editor.

                                        Current file:
                                        ${args.path}
                                        
                                        Rewrite the ENTIRE file safely.

                                        Requirements:
                                        - Return the ENTIRE file.
                                        - Modify ONLY requested parts.
                                        - Never omit lines.
                                        - Never summarize.
                                        - Never explain.
                                        - Never use markdown.
                                        - Preserve unrelated code exactly.
                                        - Output must be valid source code only.

                                        You MUST return the COMPLETE updated file.
                                        `
                                },

                                {
                                    role: "user",
                                    content:
                                        `
                                        USER REQUEST:
                                        ${prompt}

                                        FILE PATH:
                                        ${args.path}

                                        ORIGINAL FILE:
                                        ${fileResult.content}
                                        `
                                }
                            ],

                            stream: false,
                            options: {
                                temperature: 0,
                                top_p: 0.8,
                                num_ctx: 32768
                            }
                        });
                    
                    if (!rewriteResponse?.message?.content) {
                        console.log("NO REWRITE CONTENT GENERATED");
                        continue;
                    }

                    args.content =sanitizeGeneratedCode(rewriteResponse.message.content || "");
                    const allowsLargeDeletion =/remove|delete|replace whole|rewrite entire/i.test(prompt);
                    const originalLines =(fileResult.content || "").split("\n").length;
                    const newLines =args.content.split("\n").length;

                    if (!allowsLargeDeletion &&newLines <originalLines * 0.4) {
                        console.log("POSSIBLE TRUNCATED REWRITE");
                        continue;
                    }

                    console.log("GENERATED CONTENT PREVIEW:");
                    console.log(args.content.slice(0, 500));

                    if (!args.content.trim()) {
                        console.log("EMPTY GENERATED CONTENT");
                        continue;
                    }

                    console.log("WRITING FILE:",args.path);
                    console.log("CONTENT LENGTH:",args.content.length);

                    const result = modifyFileTool(args);
                    console.log("RESULT:",result);

                    messages.push({
                        role: "tool",
                        tool_call_id:
                            /** @type {any} */ (call).id,
                        content:
                            "File modification completed successfully."
                    });

                    messages.push({
                        role: "system",
                        content:
                            `
                            The file modification was completed successfully.

                            IMPORTANT:
                            - The edit request has already been completed.
                            - Do NOT call modify_file again.
                            - Respond naturally to the user.

                            Do NOT output raw JSON.
                            Do NOT generate another tool call.
                            `
                    });
                }
            }

            // if ( requestedReadFiles > 0 && completedReadFiles === requestedReadFiles ) { 
            //     console.log( "All requested files read successfully." ); 
            //     break; 
            // }
        }

        messages.push({
            role: "system",
            content: `
            All requested tool operations are complete.

            IMPORTANT:
            The ORIGINAL USER REQUEST was:

            "${originalUserPrompt}"

            You MUST answer ONLY that request.

            Rules:
            - Do NOT summarize workspace structure.
            - Do NOT explain unrelated code.
            - Do NOT analyze architecture unless requested.
            - Preserve the user's exact intent.
            - If user asked for outputs only,
            return outputs only.
            - If user asked for comparison,
            compare only requested behavior.

            DO NOT call more tools.
            `


        });

        const finalResponse =await ollama.chat({

                model:
                    "qwen2.5-coder:latest",
                messages,
                stream: true,
                options: {
                    temperature: 0,
                    top_p: 0.8,
                    num_ctx: 16384
                }
            });

        for await (const part of finalResponse) { 
            const chunk = String(part.message.content ?? ""); 
            onChunk(chunk); 
        }

    } catch (err) {
        console.error("AI BACKEND ERROR:",err);
        onChunk("\n\nAI backend failed.");
    }
}

module.exports = {askAIBackend};