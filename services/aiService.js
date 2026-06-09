// @ts-check

const ollamaModule = require("ollama");
const ollama = new ollamaModule.Ollama({host: "http://127.0.0.1:11434"});
const {findRelevantFiles,readFileTool,getWorkspaceTree} = require("./fileService");
const {loadChatHistory} = require("./memoryService");
const {buildMultiFileContext} = require("./MultipleFileService");
const {modifyFileTool} = require("./editService");
const {semanticSearch,rerankResults} = require("../semantic/semanticSearchService");
const {buildSemanticContext} = require("../semantic/chunkService");
const {routeTools} = require("../semantic/toolRouter");
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
    return /\b(file|folder|directory|component|api|route|backend|frontend|module|auth|login|signup|database|server|client|bug|error|fix|modify|edit|replace|refactor|explain|analyze|workspace|project|structure|tree)\b/i.test(prompt);
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

        const p = prompt.toLowerCase();
        const isGreeting =/^(hi|hello|hey|yo)$/i.test(prompt.trim());
        
        const isGeneralCodingQuestion =/(code for|implement|example|syntax|dfs|bfs|binary search|linked list|dynamic programming|segment tree|graph algorithm)/i.test(p);
        
        const isTerminalRequest =/(git|branch|commit|checkout|merge|rebase|npm|pnpm|yarn|python|node|docker|terminal|command|run|execute|pip|cargo|gradle|maven)/i.test(p);

        const routedTools = await routeTools(prompt,5);
        // console.log("ROUTED TOOLS:",routedTools.map(t => t.name));
        console.log(routedTools.map(t => ({
            name: t.name,
            score: t.score
        })));

        const TOOL_THRESHOLD = 0.50;
        const filteredTools = routedTools.filter(t => 
            (t.score || 0) >= TOOL_THRESHOLD
        );

        console.log("FILTERED:",filteredTools.map(t => ({
            name: t.name,
            score: t.score
        })));

        /** @type {Record<string,string[]>} */
        const toolDependencies = {
            modify_file: ["read_file"],
            
            read_file: ["semantic_search"]
        };

        /**
         * @param {string[]} tools
         */
        function expandTools(tools) {
            const expanded = new Set();
            /**
             * @param {string} tool
             */
            function add(tool) {
                expanded.add(tool);
                const deps = toolDependencies[tool] || [];
                
                for (const dep of deps) {
                    add(dep);
                }
            }
            
            for (const tool of tools) {
                add(tool);
            }
            
            return [...expanded];
        }

        /** @type {Array<string>} */
        let allowedTools = [];
        if (isGreeting) {
            allowedTools = [];
        }
        else if (isGeneralCodingQuestion) {
            allowedTools = [];
        }
        else if (isTerminalRequest) {
            allowedTools = ["run_command"];
        }
        else if (/\b(read|open|explain|analyze|inspect|show)\b/i.test(p) &&/\.[a-z0-9]+\b/i.test(p)) {
            allowedTools = ["semantic_search","read_file"];
        }
        else if (/\b(workspace|project|folder structure|tree|architecture)\b/i.test(p)) {
            allowedTools = ["get_workspace_tree"];
        }
        else if (/\b(edit|modify|rewrite|replace|update|refactor|delete|remove)\b/i.test(p)) {
            allowedTools = ["semantic_search","read_file","modify_file"];
        }
        else {
            allowedTools =expandTools(filteredTools.map(t => t.name));
            allowedTools =[...new Set(allowedTools)];
        }
        console.log("FINAL TOOLS:",allowedTools);

        const modification = lastModification;
        if (modification && /what.*fix|what.*changed|what.*modified/i.test(prompt)) {
            onChunk(
                `Last modified file: ${modification.file}\n` +`Request: ${modification.request}`);
                return;
        }

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
            - Prefer semantic context before using tools.
            - Use highest relevance results first.
            - If semantic context already answers the question, do not call read_file.
            - Only call read_file when semantic context is insufficient.
            - Do not call get_workspace_tree when semantic context is sufficient.
            - For file-identification questions, answer using semantic results.
            - Use file content, symbols, imports and snippets.
            - Never answer "none of the files" unless semantic results clearly support that conclusion.

            When modifying files:
            - ALWAYS return complete updated file content.
            - NEVER return partial patches.
            - NEVER omit unrelated code.
            - ALWAYS call modify_file.
            - NEVER explain edits without tool calls.
            - NEVER return manual instructions instead of tool usage.

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

            NEVER call modify_file.
            NEVER rewrite files.
            NEVER edit files.

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

        const useAutomaticSemantic = true;
        /** @type {SemanticResult[]} */
        let semanticResults = [];
        try {
            if (useAutomaticSemantic) {
                semanticResults =await semanticSearch(prompt,8);
                semanticResults =rerankResults(semanticResults).slice(0,5);
            }

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
        if (isWorkspaceRequest(prompt) && allowedTools.includes("get_workspace_tree")) {
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
        if (allowedTools.includes("modify_file") && matchedFiles.length > 0) {
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
            
            /** @type {import("ollama").Tool[]} */
            const visibleTools = allTools.filter(tool =>
                tool.function.name && allowedTools.includes(tool.function.name)
            );

            console.log("VISIBLE TOOLS:",visibleTools.map(t => t.function.name));

            const response =await ollama.chat({
                    model:
                        "qwen3.5:0.8b",
                    messages,
                    stream: false,
                    tools:  visibleTools.length > 0? visibleTools: undefined,

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

            if (semanticResults.length > 0 &&isSemanticQuestion &&toolCalls.length > 0) {
                const onlyReadCalls =toolCalls.every(
                        t =>
                            t.function.name === "read_file" ||
                            t.function.name === "get_workspace_tree"
                    );

                if (onlyReadCalls) {
                    console.log("SEMANTIC ANSWER AVAILABLE - SKIPPING TOOLS");
                    toolCalls = [];
                    break;
                }
            }

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
                if(!allowedTools.includes(toolName)) {
                    console.log("BLOCKED TOOL:",toolName);
                    continue;
                }

                const args = safeParseArgs(call.function.arguments);

                if (allowedTools.includes("run_command") &&typeof args.command === "string") {
                    args.command = args.command.replace(/^cd\s+\/workspace\s+&&\s*/i, "").replace(/^cd\s+\/home\s+&&\s*/i, "").replace(/^cd\s+.*?&&\s*/i, "");
                }

                if ((toolName === "read_file" || toolName === "modify_file") && args.query && !args.path) {
                    args.path = args.query;
                }

                if (semanticResults.length > 0 &&isSemanticQuestion) {

                    messages.push({
                        role: "system",
                        content: `
                        The semantic search already found the answer.

                        Highest ranked file:
                        ${semanticResults[0].path}

                        Do NOT call read_file.
                        Do NOT call get_workspace_tree.

                        Answer directly.
                        `
                    });

                    break;
                }

                const wantsOutput =/\b(output|outputs|print|result|execution)\b/i.test(prompt);
                if (wantsOutput &&toolName === "modify_file") {
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

                    messages.push({
                        role: "tool",
                        tool_call_id:
                            /** @type {any} */ (call).id,
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

                else if (toolName === "semantic_search") {
                    sendToolStatus(`Searching code: ${args.query}`);
                    const results = rerankResults(await semanticSearch(args.query,8)).slice(0,5);
                    await sleep(500);

                    // if (intent === "file_lookup" &&results.length > 0) {
                    //     const top = results[0];
                    //     onChunk(`${top.path} — highest semantic match`);
                    //     return;
                    // }

                    messages.push({
                        role: "tool",
                        content:buildSemanticContext(results)
                    });
                    const fileName =path.basename(results[0]?.path || "");
                    sendToolStatus(`Found in ${fileName}`);
                    await sleep(500);;
                    continue;
                }

                else if (toolName === "run_command") {
                    executedTool = true;
                    sendToolStatus(`Running command: ${args.command}`);
                    const result =await runCommand(args.command);
                    await sleep(500);

                    if (toolName === "run_command" && allowedTools.length === 1) {
                        const output =result.stdout ||result.stderr ||"No output";
                        onChunk("```bash\n" +output +"\n```");
                        return;
                    }
                    
                    if(result.success) {
                        sendToolStatus("Command completed");
                        await sleep(500);
                    } else {
                        sendToolStatus("Command failed");
                    }

                    messages.push({
                        role: "tool",
                        tool_call_id:
                            /** @type {any} */ (call).id,
                        content:
                            JSON.stringify(result)
                    });

                    messages.push({
                        role: "system",
                        content: `
                        The command has already been executed.

                        Do NOT run additional commands.

                        Do NOT investigate further.

                        Analyze the command output and answer the user.
                        `
                    });
                    toolCalls = [];
                    break;
                }

                else if (toolName === "modify_file") {
                    const fileWasRead =messages.some(m =>
                        m.role === "tool" && String(m.content).includes('"content"')
                    );
                    
                    if (!fileWasRead) {
                        console.log("BLOCKED MODIFY_FILE WITHOUT READ_FILE");
                        continue;
                    }

                    executedTool = true;
                    const requestedPath =args.path || "";
                    let matchedPath =matchedFiles.find(file =>file.toLowerCase().endsWith(requestedPath.toLowerCase()));

                    if (!matchedPath) {
                        const semanticMatch =semanticResults.find(result =>
                                    result.path.toLowerCase().endsWith(
                                        requestedPath.toLowerCase()
                                    )
                        );
                        matchedPath =semanticMatch?.path;
                    }
                    
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

                    console.log("TOOL RESULT SIZE:",JSON.stringify(messages).length);

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
                    const fileName =path.basename(args.path || "");
                    sendToolStatus(`Writing ${fileName}`);
                    await sleep(500);
                    console.log("CONTENT LENGTH:",args.content.length);

                    const result = modifyFileTool(args);
                    sendToolStatus(`Saved ${fileName}`);
                    await sleep(500);
                    lastModification = {file: args.path,timestamp: Date.now(),request: prompt};
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