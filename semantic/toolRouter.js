// @ts-check

const { generateEmbedding } = require("./embeddingService");

/**
 * @typedef {{
 * name:string,
 * description:string,
 * embedding?:number[],
 * score?:number
 * }} ToolDefinition
 */

/** @type {ToolDefinition[]} */
const toolDefinitions = [
    {
        name: "semantic_search",
        description:
            "Find files, classes, functions, symbols, imports and modules semantically"
    },

    {
        name: "run_command",
        description:
            "Execute terminal commands and shell commands"
    },

    {
        name: "read_file",
        description:
            "Read actual file contents for debugging, workflow analysis and code inspection"
    },

    {
        name: "modify_file",
        description:
            "Modify file contents and save changes"
    },

    {
        name: "get_workspace_tree",
        description:
            "List folders and files in workspace"
    }
];

let initialized = false;

async function initializeTools() {
    if (initialized) {
        return;
    }

    for (const tool of toolDefinitions) {
        tool.embedding =await generateEmbedding(tool.description);
    }
    initialized = true;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cosineSimilarity(a,b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0;i < a.length;i++) {
        dot +=a[i] * b[i];
        magA +=a[i] * a[i];
        magB +=b[i] * b[i];
    }

    if (magA === 0 ||magB === 0) {
        return 0;
    }

    return (dot /(Math.sqrt(magA) *Math.sqrt(magB)));
}


/**
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<ToolDefinition[]>}
 */
async function routeTools(query,limit = 3) {

    await initializeTools();
    const queryEmbedding =await generateEmbedding(query);

    /** @type {ToolDefinition[]} */
    const scored =toolDefinitions.map(tool => ({

                ...tool,

                score:
                    tool.embedding? cosineSimilarity(queryEmbedding,tool.embedding): 0
            })
        );

    scored.sort((a, b) =>(b.score || 0) -(a.score || 0));
    return scored.slice(0,limit);
}

/**
 * @param {string} intent
 * @param {any[]} availableTools
 */

module.exports = {routeTools,cosineSimilarity,toolDefinitions};