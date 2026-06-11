// @ts-check

const ollamaModule = require("ollama");
const ollama = new ollamaModule.Ollama({host: "http://127.0.0.1:11434"});
const {findRelevantFiles,readFileTool,getWorkspaceTree} = require("./fileService");
const {searchAndReplace}=require("./searchAndReplace");
const {loadChatHistory} = require("./memoryService");
const {buildMultiFileContext} = require("./MultipleFileService");
// const {modifyFileTool} = require("./editService");
const {semanticSearch,rerankResults} = require("../semantic/semanticSearchService");
const {buildSemanticContext} = require("../semantic/chunkService");
const {runCommand} = require("./terminalService");

/**
 * @typedef {{
 * file:string,
 * timestamp:number,
 * request:string
 * }} ModificationRecord
 */

/** @type {ModificationRecord | null} */
let lastModification = null;
const path = require("path");

// let isShowingStatus = false;

/**
 * @typedef {{
 * path:string,
 * content:string,
 * score:number,
 * chunkId:number,
 * embedding:number[]
 * }} SemanticResult
 */

// /**
//  * @param {string} text
//  */
// function sanitizeGeneratedCode(text) {
//     return text
//         .replace(/```[a-zA-Z]*/g, "")
//         .replace(/```/g, "")
//         .replace(/^\d+:\s?/gm, "")
//         .trim();
// }

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

// /**
//  * @param {string} prompt
//  */
// function isEditRequest(prompt) {
//     return /\b(modify|edit|replace|refactor|update|rewrite|remove|delete|insert|append|prepend|add|fix|change)\b/i.test(prompt);
// }

/**
 * @param {string} prompt
 */
function shouldSearchFiles(prompt) {
    return (/\b(file|folder|directory|component|api|route|backend|frontend|module|auth|login|signup|database|server|client|bug|error|fix|modify|edit|replace|refactor|explain|analyze|workspace|project|structure|tree)\b/i.test(prompt) 
        || /\b\w+\.(py|js|ts|tsx|jsx|cpp|c|java|cs|go|rs)\b/i.test(prompt)
    );
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
        /**
        * @param {string} message
        */
        function sendToolStatus(message) {
            onChunk(
                "__STATUS__" + message
            );
        }

        /**
        * @param {number} ms
        */
        function sleep(ms) {
            return new Promise(resolve =>
                setTimeout(resolve, ms)
            );
        }

        const modification = lastModification;
        if (modification && /what.*fix|what.*changed|what.*modified/i.test(prompt)) {
            onChunk(
                `Last modified file: ${modification.file}\n` +`Request: ${modification.request}`);
                return;
        }

        const originalUserPrompt = prompt;
        const wantsFileRead =/\b(read|explain|analyze|inspect|compare)\b/i.test(prompt);
        const wantsOutput =/\b(output|outputs|execution|result|print)\b/i.test(prompt);

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
            - execute terminal commands

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

            Semantic Retrieval Rules:
            - Semantic context comes from real workspace files.
            - Treat semantic context as trusted file content.
            - Semantic context contains retrieved code chunks.

            Semantic search is only for discovery.

            After identifying a relevant file,
            use read_file whenever the user asks:
                - read
                - explain
                - analyze
                - inspect
                - compare
                - output
                - execution
                
            - Use highest relevance results first.
            - Only call read_file when semantic context is insufficient.
            - Do not call get_workspace_tree when semantic context is sufficient.
            - For file-identification questions, answer using semantic results.
            - Use file content, symbols, imports and snippets.
            - Never answer "none of the files" unless semantic results clearly support that conclusion.

            For code modifications:

            Prefer search_and_replace
            instead of rewriting
            entire files.

            Use read_file first if
            you need context.

            Only use search_and_replace
            for localized changes.

            Output Analysis Rules:
            - If the user asks for:
            - output
            - outputs
            - what will this print
            - execution result
            - runtime result

            Then:

            1. Read files if necessary.
            2. Analyze the code.
            3. Return only the output.

            NEVER call search_and_replace.
            NEVER rewrite files.
            NEVER edit files.

            When user asks:
            - explain
            - analyze

            Do NOT return full file content.

            Summarize the file instead.

            File Identification Rules:

            If the user asks:
            - Which file
            - What file
            - Where is

            Return:
            - filename
            - one-sentence explanation

            Do not return:
            - code snippets
            - workspace trees
            - tool calls
            - unrelated files

            Choose the most relevant semantic result unless the user explicitly asks for multiple files.

            Never return code snippets unless explicitly requested.

            For file-identification questions:

            If semantic results already contain
            the answer,

            DO NOT call read_file.

            Answer immediately.

            Return:
            filename — one sentence explanation

            Example:
            comp.py — trains a RandomForestClassifier and predicts malicious traffic.

            Bug Analysis Rules:

            - Never invent code.
            - Never generate replacement code
            unless requested.

            - Only analyze code that was
            retrieved from files.

            - If evidence is insufficient,
            say so.

            - Cite actual functions,
            variables and logic.

            Project Analysis Rules:

            - Use multiple files when needed.
            - Explain relationships.
            - Do not hallucinate workflows.

            For bug analysis:

            - ALWAYS read the target file first.
            - NEVER analyze semantic snippets alone.
            - NEVER invent bugs.
            - Only report bugs found in the actual file content.

            File Lookup Rules:

            - Return filename and short reason.
            - Do not output code.
            - Do not call tools when semantic
            context already answers.

            Workspace Discovery Rules:

            - Before reading files, use semantic_search.
            - semantic_search is the preferred workspace discovery tool.
            - Use read_file only after identifying relevant files.
            - Do not call get_workspace_tree unless specifically needed.

            For output prediction:
            ALWAYS read the file first.
            Never answer from semantic snippets alone.

            Terminal Rules:

            - Never invent file paths.
            - Never use /home, /path/to/repo, C:\project or placeholder paths.
            - The current VS Code workspace is already the working directory.
            - Execute commands directly.
            - For git status use:
                git status

            - For git branches use:
                git branch

            - For current directory use:
                pwd (Linux/macOS)
                cd (Windows)

            - Do not prepend cd commands unless the user explicitly specifies a path.

            When using run_command:

            You MUST execute commands exactly as they would be typed
            inside the currently opened VS Code workspace.

            NEVER generate:

            cd /workspace
            cd /home
            cd /path/to/repo
            cd C:\project

            Examples:

            User: check git status
            Correct:
            git status

            User: show branches
            Correct:
            git branch

            User: run test.py
            Correct:
            python test.py

            User: list files
            Correct:
            dir

            For search_and_replace:

            NEVER replace single letters.

            NEVER replace variable names globally.

            The search string must contain at least
            one full line of code or a unique code block.

            Avoid replacing identifiers like:
            i
            j
            k
            x
            y
            z

            unless the exact surrounding code
            is included.
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

        // const useAutomaticSemantic = shouldSearchFiles(prompt);
        /** @type {SemanticResult[]} */
        // let semanticResults = [];
        try {
            // if (useAutomaticSemantic) {
            //     semanticResults =await semanticSearch(prompt,8);
            //     semanticResults =rerankResults(semanticResults).slice(0,5);
            // }

            // semanticResults =await semanticSearch(prompt,8);
            // const topScore =semanticResults[0]?.score || 0;
            // if (topScore < 0.5) {
            //     console.log("LOW CONFIDENCE SEARCH");
            // }
            // semanticResults =rerankResults(semanticResults).slice(0,5);
            // console.log("SEMANTIC RESULTS:",semanticResults.length);

            // console.log("TOP SEMANTIC FILES:");
            // semanticResults.forEach(item => {
            //     console.log(item.path,item.score);
            // });

        } catch (err) {
            console.error("SEMANTIC SEARCH ERROR:",err);
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

        // if (semanticResults.length > 0) {
        //     const semanticContext =buildSemanticContext(semanticResults);
        //     contextualPrompt = `
        //         SEMANTIC CONTEXT:

        //         ${semanticContext}

        //         IMPORTANT:

        //         The results are already ranked by relevance.

        //         RESULT 1 is most relevant.
        //         RESULT 2 is less relevant.
        //         RESULT 3 is less relevant.

        //         For questions asking:

        //         - which file
        //         - where is
        //         - what module

        //         prefer the highest ranked result.

        //         Only use tools if semantic context is insufficient.

        //         If the user asks:

        //         - Which file
        //         - What file
        //         - Where is

        //         Then answer ONLY with the filename and a brief reason.

        //         Do NOT output code snippets.

        //         Examples:

        //         User:
        //         Which file repeatedly asks for user input?

        //         Correct:
        //         calc.py — contains input() calls and an interactive loop.

        //         Wrong:
        //         <code snippet>

        //         User:
        //         Which file contains machine learning code?

        //         Correct:
        //         comp.py — trains a RandomForestClassifier.

        //         Wrong:
        //         <code snippet>

        //         USER REQUEST:

        //         ${prompt}
        //     `;
        // }
        
        else if (matchedFiles.length > 1 &&! wantsFileRead &&! wantsOutput) {
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
        // if ( matchedFiles.length > 0) {
        //     const fileResult =readFileTool({path: matchedFiles[0]});

        //     if (fileResult?.success) {
        //         const fullFile =fileResult.content || "";

        //         finalUserPrompt = `
        //             USER REQUEST:
        //             ${prompt}

        //             FULL FILE CONTENT:

        //             \`\`\`
        //             ${fullFile}
        //             \`\`\`

        //             IMPORTANT:
        //             - Return ONLY tool calls.
        //             - Rewrite the ENTIRE updated file.
        //             - Preserve all unrelated code.
        //             - Modify ONLY requested parts.
        //             - Do NOT omit any code.
        //         `;
        //     }
        // }

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

        const maxIterations = 10;

        let iteration = 0;
        while (iteration < maxIterations) {
            iteration++;

            /** @type {import("ollama").Tool[]} */
            const allTools =[

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
                                name: "get_workspace_tree",
                                description:
                                    "Get workspace hierarchy",

                                parameters: {
                                    type: "object",
                                    properties: {},
                                    required: []
                                }
                            }
                        },

                        // {
                        //     type: "function",

                        //     function: {
                        //         name: "modify_file",
                        //         description:
                        //             `
                        //             Rewrite an entire file with updated content.

                        //             IMPORTANT:
                        //             - ALWAYS return the FULL updated file content.
                        //             - NEVER return partial snippets.
                        //             - Preserve unrelated code exactly.
                        //             - Only modify requested parts.
                        //             - Maintain formatting and indentation.
                        //         `,
                        //         parameters: {
                        //             type: "object",
                        //             properties: {
                        //                 path: {
                        //                     type: "string",
                        //                     description:
                        //                         "Filename only. Example: merge.py"
                        //                 }
                        //             },
                        //             required: ["path"]
                        //         }
                        //     }
                        // },

                        {
                            type: "function",
                            function: {
                                name: "search_and_replace",
                                description:
                                    "Find and replace exact code, variables, functions, classes or blocks inside a file.",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string" },
                                        search: { type: "string" },
                                        replace: { type: "string" },
                                        occurrence: {
                                            type: "string",
                                            enum: ["first", "all"]
                                        }
                                    },
                                    required: ["path","search","replace"]
                                }
                            }
                        },

                        {
                            type: "function",

                            function: {
                                name: "run_command",

                                description:
                                    `
                                    Execute any terminal command.

                                    Examples:
                                    - npm install
                                    - npm run build
                                    - python app.py
                                    - git status
                                    - docker ps

                                    Returns stdout and stderr.
                                    `,

                                parameters: {
                                    type: "object",

                                    properties: {
                                        command: {
                                            type: "string",
                                            description:
                                                "Terminal command to execute"
                                        }

                                    },
                                    required: ["command"]
                                }
                            }
                        },

                        {
                            type: "function",

                            function: {
                                name: "semantic_search",
                                description:
                                    `
                                    Search the workspace semantically.

                                    Use this tool FIRST when:
                                    - locating files
                                    - finding symbols
                                    - finding classes
                                    - finding functions
                                    - finding bugs
                                    - finding related modules

                                    This is preferred over read_file.

                                    Use read_file only after semantic_search
                                    identifies relevant files.
                                    `,

                                parameters: {
                                    type: "object",
                                    properties: {
                                        query: {
                                            type: "string"
                                        }
                                    }   
                                }
                            }
                        }
                    ];
                
            sendToolStatus("Thinking...");
            const response =await ollama.chat({
                    model:
                        "qwen3.5:4b",
                    messages,
                    stream: false,
                    tools: allTools,

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
            const isSemanticQuestion =/(which\s+file|what\s+file|where\s+is|contains|related\s+to|predicts|uses|implements)/i.test(prompt);

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
            
            let executedTool = false;
            for (const call of toolCalls) {
                console.log( "EXECUTING:", call.function.name );

                const toolName =call.function.name;
                const args = safeParseArgs(call.function.arguments);

                if (typeof args.command === "string") {
                    args.command = args.command.replace(/^cd\s+\/workspace\s+&&\s*/i, "").replace(/^cd\s+\/home\s+&&\s*/i, "").replace(/^cd\s+.*?&&\s*/i, "");
                }

                if ((toolName === "read_file" || toolName === "search_and_replace") && args.query && !args.path) {
                    args.path = args.query;
                }

                // if (semanticResults.length > 0 &&isSemanticQuestion) {

                //     messages.push({
                //         role: "system",
                //         content: `
                //         The semantic search already found the answer.

                //         Highest ranked file:
                //         ${semanticResults[0].path}

                //         Do NOT call read_file.
                //         Do NOT call get_workspace_tree.

                //         Answer directly.
                //         `
                //     });

                //     break;
                // }

                if (wantsOutput &&toolName === "search_and_replace") {
                    console.log("BLOCKED MODIFY_FILE FOR OUTPUT REQUEST");
                    continue;
                }

                if (toolName === "read_file") {
                    executedTool = true;
                    const fileName =path.basename(args.path || "");
                    sendToolStatus(`Reading ${fileName}`);
                    const result =readFileTool(args);
                    await sleep(500);
                    // completedReadFiles++;

                    console.log("RESULT:", result);
                    const toolCallId =
                    /** @type {any} */ (call).id ||
                    `tool_${Date.now()}`;

                    messages.push({
                        role: "tool",
                        tool_call_id:toolCallId,
                        content:
                            JSON.stringify(result)
                    });
                }

                else if (toolName ==="get_workspace_tree") {
                    executedTool = true;
                    sendToolStatus("Analyzing workspace");
                    const tree =getWorkspaceTree();
                    await sleep(500);
                    sendToolStatus(" Workspace analyzed");
                    await sleep(500);
        
                    console.log("RESULT:", tree);
                    const toolCallId =
                    /** @type {any} */ (call).id ||
                    `tool_${Date.now()}`;

                    messages.push({
                        role: "tool",
                        tool_call_id:toolCallId,
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

                else if (toolName === "semantic_search") {
                    sendToolStatus(`Searching code: ${args.query}`);
                    const results = rerankResults(await semanticSearch(args.query,8)).slice(0,5);
                    await sleep(500);

                    console.log("SEMANTIC FILES:",results.map(r => ({file: r.path,score: r.score})));

                    if (results.length > 0 &&isSemanticQuestion) {
                        onChunk(`${path.basename(results[0].path)} — highest semantic match`);
                        return;
                    }
                    
                    // if (intent === "file_lookup" &&results.length > 0) {
                    //     const top = results[0];
                    //     onChunk(`${top.path} — highest semantic match`);
                    //     return;
                    // }

                    const toolCallId =
                    /** @type {any} */ (call).id ||
                    `tool_${Date.now()}`;

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCallId,
                        content: buildSemanticContext(results)
                    });

                    const files =results.slice(0,3).map(r => path.basename(r.path)).join(", ");
                    sendToolStatus(`Found candidates: ${files}`);
                    await sleep(500);;
                    continue;
                }

                else if (toolName === "run_command") {
                    executedTool = true;
                    sendToolStatus(`Running command: ${args.command}`);

                    const result = await runCommand(args.command);
                    await sleep(500);

                    if (result.success) {
                        sendToolStatus("Command completed");
                    } else {
                        sendToolStatus("Command failed");
                    }
                    await sleep(500);

                    const toolCallId =
                        /** @type {any} */ (call).id ||
                        `tool_${Date.now()}`;

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCallId,
                        content: JSON.stringify(result)
                    });

                    messages.push({
                        role: "system",
                        content: `
                        The command has already been executed.

                        IMPORTANT:
                        - Do NOT execute the command again.
                        - Do NOT run alternative commands.
                        - Do NOT investigate further.
                        - Use ONLY the command output provided.
                        - Explain the result if needed.
                        - If the user requested terminal output, show the output.
                        `
                    });
                    break;
                }

                else if (toolName ==="search_and_replace") {

                    executedTool = true;
                     const toolCallId =
                    /** @type {any} */ (call).id ||
                    `tool_${Date.now()}`;
                    if (!args.path ||!args.search ||!args.replace) {
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCallId,
                            content: JSON.stringify({
                                success: false,
                                error:
                                "path, search and replace are required"
                            })
                        });
                        continue;
                    }

                    const requestedPath =String(args.path || "").replace(/\\\\/g, "\\");

                    let matchedPath =matchedFiles.find(file =>file.toLowerCase() ===requestedPath.toLowerCase());
                    if (!matchedPath) {
                        matchedPath = matchedFiles.find(file =>
                            file.toLowerCase().endsWith(path.basename(requestedPath).toLowerCase())
                        );
                    }

                    if (!matchedPath) {
                        console.log("NO MATCHED FILE PATH FOUND");
                        continue;
                    }
                    args.path = matchedPath;

                    const result = await searchAndReplace(args.path,args.search,args.replace,args.occurrence || "first");
                    console.log("SEARCH_AND_REPLACE RESULT:",result);

                    messages.push({
                        role: "tool",
                        tool_call_id:toolCallId,
                        content:
                            JSON.stringify(result)
                    });

                    messages.push({
                        role: "system",
                        content: `
                        The replacement has already been applied.

                        Do NOT call search_and_replace again.

                        Explain what was changed.
                        `
                    });

                }

                // else if (toolName === "modify_file") {
                //     const fileWasRead =messages.some(m =>
                //         m.role === "tool" && String(m.content).includes('"content"')
                //     );
                    
                //     if (!fileWasRead) {
                //         console.log("BLOCKED MODIFY_FILE WITHOUT READ_FILE");
                //         continue;
                //     }

                //     executedTool = true;
                //     const requestedPath =String(args.path || "").replace(/\\\\/g, "\\");
                //     let matchedPath = matchedFiles.find(file =>file.toLowerCase() ===requestedPath.toLowerCase());

                //     if (!matchedPath) {
                //         matchedPath = matchedFiles.find(file =>
                //             file.toLowerCase().endsWith(
                //                 path.basename(requestedPath).toLowerCase()
                //             )
                //         );
                //     }

                //     if (!matchedPath) {
                //         const semanticMatch =semanticResults.find(result =>
                //                     result.path.toLowerCase().endsWith(
                //                         requestedPath.toLowerCase()
                //                     )
                //         );
                //         matchedPath =semanticMatch?.path;
                //     }
                    
                //     if (matchedPath) {
                //         args.path =matchedPath;
                //     }else{
                //         console.log("NO MATCHED FILE PATH FOUND");
                //         continue;
                //     }

                //     const fileResult =readFileTool({path: requestedPath});
                //     if (fileResult?.success) {
                //         args.path = fileResult.path;
                //     }else{
                //         console.log("FAILED TO READ FILE");
                //         continue;
                //     }

                //     console.log("TOOL RESULT SIZE:",JSON.stringify(messages).length);

                //     const alreadyModified =messages.some(m =>
                //         m.role === "tool" && String(m.content).includes("File modification completed successfully.")
                //     );

                //     if (alreadyModified) {
                //         continue;
                //     }

                //     const rewriteResponse = await ollama.chat({
                    
                //             model:
                //                 "qwen2.5-coder:latest",
                //             messages: [
                //                 {
                //                     role: "system",
                //                     content:
                //                         `
                //                         You are an expert code editor.

                //                         Current file:
                //                         ${args.path}
                                        
                //                         Rewrite the ENTIRE file safely.

                //                         Requirements:
                //                         - Return the ENTIRE file.
                //                         - Modify ONLY requested parts.
                //                         - Never omit lines.
                //                         - Never summarize.
                //                         - Never explain.
                //                         - Never use markdown.
                //                         - Preserve unrelated code exactly.
                //                         - Output must be valid source code only.

                //                         You MUST return the COMPLETE updated file.
                //                         `
                //                 },

                //                 {
                //                     role: "user",
                //                     content:
                //                         `
                //                         USER REQUEST:
                //                         ${prompt}

                //                         FILE PATH:
                //                         ${args.path}

                //                         ORIGINAL FILE:
                //                         ${fileResult.content}
                //                         `
                //                 }
                //             ],

                //             stream: false,
                //             options: {
                //                 temperature: 0,
                //                 top_p: 0.8,
                //                 num_ctx: 32768
                //             }
                //         });
                    
                //     if (!rewriteResponse?.message?.content) {
                //         console.log("NO REWRITE CONTENT GENERATED");
                //         continue;
                //     }

                //     args.content =sanitizeGeneratedCode(rewriteResponse.message.content || "");
                //     const allowsLargeDeletion =/remove|delete|replace whole|rewrite entire/i.test(prompt);
                //     const originalLines =(fileResult.content || "").split("\n").length;
                //     const newLines =args.content.split("\n").length;

                //     if (!allowsLargeDeletion &&newLines <originalLines * 0.4) {
                //         console.log("POSSIBLE TRUNCATED REWRITE");
                //         continue;
                //     }

                //     console.log("GENERATED CONTENT PREVIEW:");
                //     console.log(args.content.slice(0, 500));

                //     if (!args.content.trim()) {
                //         console.log("EMPTY GENERATED CONTENT");
                //         continue;
                //     }

                //     console.log("WRITING FILE:",args.path);
                //     const fileName =path.basename(args.path || "");
                //     sendToolStatus(`Writing ${fileName}`);
                //     await sleep(500);
                //     console.log("CONTENT LENGTH:",args.content.length);

                //     const result = modifyFileTool(args);
                //     sendToolStatus(`Saved ${fileName}`);
                //     await sleep(500);
                //     lastModification = {file: args.path,timestamp: Date.now(),request: prompt};
                //     console.log("RESULT:",result);
                    
                //     const toolCallId =
                //     /** @type {any} */ (call).id ||
                //     `tool_${Date.now()}`;

                //     messages.push({
                //         role: "tool",
                //         tool_call_id:toolCallId,
                //         content:
                //             "File modification completed successfully."
                //     });

                //     messages.push({
                //         role: "system",
                //         content:
                //             `
                //             The file modification was completed successfully.

                //             IMPORTANT:
                //             - The edit request has already been completed.
                //             - Do NOT call modify_file again.
                //             - Respond naturally to the user.

                //             Do NOT output raw JSON.
                //             Do NOT generate another tool call.
                //             `
                //     });
                // }
                
                if (!executedTool) {
                    console.log("NO TOOLS EXECUTED, BREAKING LOOP");
                    break;
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

        sendToolStatus("Generating response...");
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