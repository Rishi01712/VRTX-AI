// @ts-check

const {findRelevantFiles,readFileTool} = require("./fileService");

/**
 * @param {string} prompt
 */
function extractFileNames(prompt) {
    const matches =prompt.match(/\b[\w.-]+\.[a-zA-Z0-9]+\b/g);
    return matches || [];
}

/**
 * @param {string} prompt
 */
async function buildMultiFileContext(prompt) {
    const filenames =extractFileNames(prompt);
    if (filenames.length === 0) {
        return null;
    }

    /** @type {string[]} */
    const contextParts = [];
    for (const filename of filenames) {
        const files =await findRelevantFiles(filename);
        if ( files.length === 0) {
            contextParts.push(
                `
                FILE:
                ${filename}

                ERROR:
                File not found.
                `
            );

            continue;
        }

        const result =readFileTool({path:files[0]});
        if (result.success) {
            contextParts.push(
                `
                FILE:
                ${filename}

                PATH:
                ${files[0]}

                CONTENT:
                ${result.content}
                `
            );

        }
        else {
            contextParts.push(
                `
                FILE:
                ${filename}

                ERROR:
                ${result.error}
                `
            );
        }
    }

    return (
        `
        MULTIPLE FILE CONTEXT
        ${contextParts.join("\n\n====================\n\n")}
        USER REQUEST:        ${prompt}
        `
    );
}

module.exports = {buildMultiFileContext};