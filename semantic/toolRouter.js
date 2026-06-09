// @ts-check

const { generateEmbedding } = require("./embeddingService");

/**
 * @typedef {{
 * name:string,
 * description:string,
 * embedding?:number[],
 * score?:number
 * }} Definition
 */

/** @type {Definition[]} */
const toolDefinitions = [

    {
        name: "semantic_search",
        description:
            "Find files classes functions symbols imports modules and code semantically"
    },

    {
        name: "run_command",
        description:
            "Execute terminal shell git npm docker python node commands"
    },

    {
        name: "read_file",
        description:
            "Read file contents for debugging inspection analysis"
    },

    {
        name: "modify_file",
        description:
            "Modify edit rewrite update source code files"
    },

    {
        name: "get_workspace_tree",
        description:
            "Analyze workspace project folders structure hierarchy"
    }
];

/** @type {Definition[]} */
const intentDefinitions = [

    {
        name: "terminal",
        description:
            "Run terminal commands git npm docker shell execute programs"
    },

    {
        name: "file_lookup",
        description:
            "Find which file contains a class function symbol module"
    },

    {
        name: "bug_analysis",
        description:
            "Analyze bugs errors crashes exceptions debugging"
    },

    {
        name: "edit",
        description:
            "Modify update rewrite refactor source code"
    },

    {
        name: "project_analysis",
        description:
            "Explain architecture workflow structure project"
    }
];

let initialized = false;

async function initializeEmbeddings() {

    if (initialized) {
        return;
    }

    for (const tool of toolDefinitions) {
        tool.embedding = await generateEmbedding(tool.description);
    }

    for (const intent of intentDefinitions) {
        intent.embedding = await generateEmbedding(intent.description);
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
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    if (!magA || !magB) {
        return 0;
    }

    return dot /(Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * @param {string} prompt
 * @param {number} limit
 */
async function routeTools(prompt, limit = 3) {

    await initializeEmbeddings();

    const queryEmbedding =await generateEmbedding(prompt);

    const scored =toolDefinitions.map(tool => ({
            ...tool,

            score:
                cosineSimilarity(queryEmbedding,tool.embedding || [])
        }));

    scored.sort((a,b) =>
        (b.score || 0) - (a.score || 0)
    );

    return scored.slice(0, limit);
}

module.exports = {routeTools,toolDefinitions,cosineSimilarity};