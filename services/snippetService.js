// @ts-check

/**
 *
 * @param {string} content
 * @param {string} query
 * @param {boolean} includeLineNumbers
 */
function extractRelevantSnippet(content,query,includeLineNumbers=false) {
    const lines = content.split("\n");
    const keywords =query.toLowerCase().split(/\W+/).filter(Boolean);

    let bestIndex = -1;
    let bestScore = -1;

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const line =originalLine.toLowerCase();

        let score = 0;
        for (const keyword of keywords) {
            if (line.includes(keyword)) {
                score += 3;
            }
        }

        if (/\w+\s*=/.test(line)) {
            score += 5;
        }

        const normalizedQuery =query.toLowerCase().replace(/\s+/g, " ").trim();
        const normalizedLine =line.replace(/\s+/g, " ").trim();

        if (normalizedQuery.includes("=") && normalizedLine.includes("=")) {
            const queryLeft =normalizedQuery.split("=")[0].trim();
            const lineLeft =normalizedLine.split("=")[0].trim();

            if (queryLeft === lineLeft) {
                score += 20;
            }
        }

        if (/\bdef\b|\bfunction\b/.test(line) &&  line.includes("(")) {
            score -= 5;
        }

        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    if (bestIndex === -1) {
        const fallback =lines.slice(0, 30);
        return includeLineNumbers? addLineNumbers(fallback, 0): fallback.join("\n");
    }

    const start =Math.max(0, bestIndex - 5);
    const end =Math.min(lines.length,bestIndex + 10);
    const snippet =lines.slice(start, end);

    return includeLineNumbers? addLineNumbers(snippet, start): snippet.join("\n");
}

/**
 *
 * @param {string[]} lines
 * @param {number} start
 */
function addLineNumbers(lines, start) {
    return lines.map((line, index) => {
            return `${start + index + 1}: ${line}`;
        }).join("\n");
}

module.exports = {extractRelevantSnippet};