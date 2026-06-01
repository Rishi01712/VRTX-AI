// @ts-check

const MAX_CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

/**
 * @param {string} content
 */
function chunkContent(content) {
    if (!content?.trim()) {
        return [];
    }

    const chunks = [];
    let start = 0;
    while (start < content.length) {
        let end =Math.min(start + MAX_CHUNK_SIZE,content.length);

        if (end < content.length) {
            const nextNewLine =content.lastIndexOf("\n",end);
            if (nextNewLine > start) {
                end = nextNewLine;
            }
        }

        const chunk =content.slice(start, end).trim();
        if (chunk) {
            chunks.push(chunk);
        }

        start =end - CHUNK_OVERLAP;
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

module.exports = {chunkContent, buildSemanticContext};