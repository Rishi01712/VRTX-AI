// @ts-check

/**
 * @param {string} content
 */
function extractSymbols(content) {
    const symbols = [];

    const patterns = [

        /(?:def|function)\s+([a-zA-Z_]\w*)/g,

        /class\s+([a-zA-Z_]\w*)/g,

        /(?:const|let|var)\s+([a-zA-Z_]\w*)/g
    ];

    for (const pattern of patterns) {
        const matches =content.matchAll(pattern);

        for (const match of matches) {
            if (match[1]) {
                symbols.push(match[1]);
            }
        }
    }

    return [...new Set(symbols)];
}

/**
 * @param {string} file
 * @param {string} content
 * @param {string[]} symbols
 */
function generateSummary(file,content,symbols) {
    const extension =file.split(".").pop() || "";
    const imports =content.split("\n").filter(line =>
            line.startsWith("import ") ||
            line.startsWith("from ") ||
            line.startsWith("#include")
    ).slice(0, 10);

    return {language: extension,imports,symbols};
}

module.exports = {extractSymbols,generateSummary};