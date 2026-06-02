// @ts-check

const Parser = require("tree-sitter");
const JavaScript = require("tree-sitter-javascript");
const Python = require("tree-sitter-python");
const TypeScript = require("tree-sitter-typescript").typescript;

/**
 * @typedef {{
 * type:string,
 * symbol:string,
 * content:string
 * }} SemanticChunk
 */

const MAX_CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

/**
 * @param {string} language
 */
function getLanguage(language) {
    switch (language) {
        case "js":
        case "jsx":
            return JavaScript;

        case "ts":
        case "tsx":
            return TypeScript;

        case "py":
            return Python;

        default:
            return null;
    }
}

/**
 * Fallback chunking
 * @param {string} content
 */
function fallbackChunk(content) {

    const chunks = [];

    let start = 0;
    while (start < content.length) {
        const end =Math.min(start + MAX_CHUNK_SIZE,content.length);

        chunks.push({type: "text",symbol: "",content:content.slice(start, end)});

        start = end - CHUNK_OVERLAP;
        if (start < 0) {
            start = 0;
        }

        if (end >= content.length) {
            break;
        }
    }
    return chunks;
}

/**
 * @param {string} content
 * @param {string} language
 */
function createSemanticChunks(content,language) {
    const grammar =getLanguage(language);
    if (!grammar) {
        return fallbackChunk(content);
    }

    try {
        const parser =new Parser();
        parser.setLanguage( /** @type {any} */ (grammar));

        const tree =parser.parse(content);
        /** @type {SemanticChunk[]} */
        const chunks = [];

        /**
         * @param {any} node
         */
        function visit(node) {
            const interestingTypes = [

                "function_declaration",
                "function_definition",

                "method_definition",

                "class_declaration",
                "class_definition",

                "lexical_declaration",

                "interface_declaration",

                "type_alias_declaration"
            ];

            if (interestingTypes.includes(node.type)) {

                const text =content.slice(node.startIndex,node.endIndex);
                const symbolNode =node.childForFieldName("name");

                if (text.trim().length > 0) {
                    chunks.push({
                        type:
                            node.type,

                        symbol:
                             symbolNode?.text || "",

                        content:
                            text
                    });
                }
            }

            for (let i = 0;i < node.namedChildCount;i++) {
                visit(node.namedChild(i));
            }
        }
        visit(tree.rootNode);

        if (chunks.length === 0) {
            return fallbackChunk(content);
        }
        return chunks;

    } catch (err) {
        console.error("TREE SITTER FAILED:",err);
        return fallbackChunk(content);
    }
}



/**
 * @typedef {{
 * path:string,
 * content:string,
 * score:number,
 * language?:string,
 * imports?:string[],
 * symbols?:string[]
 * }} SemanticResult
 */

/**
 * @param {SemanticResult[]} results
 */
function buildSemanticContext(results) {
    if (!results?.length) {
        return "";
    }

    let context ="TOP SEMANTIC RESULTS\n\n";
    results.forEach((item,index) => {
            const preview = item.content.split("\n").slice(0,5).join("\n");
            context +=
                `
                RESULT ${index + 1}

                FILE:
                ${item.path}

                RELEVANCE SCORE:
                ${item.score.toFixed(4)}

                IMPORTANT:
                This file was retrieved because it is semantically relevant
                to the user request.

                Use higher scores first.

                LANGUAGE:
                ${item.language || "unknown"}

                IMPORTS:
                ${(item.imports || []).join(", ")}

                SYMBOLS:
                ${(item.symbols || []).join(", ")}

                IMPORTANT:
                The snippet below is real code from the file.
                Use it to infer the file's purpose.

                SNIPPET:
                ${preview}

                ----------------------------------
                `;
        }
    );

    return context;
}

module.exports = {createSemanticChunks, buildSemanticContext};