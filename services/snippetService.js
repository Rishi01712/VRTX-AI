// @ts-check

/**
 * @param {string} content
 * @param {string} query
 */
function extractRelevantSnippet(content,query) {
    const lines =content.split("\n");
    const keywords =query.toLowerCase().split(/\W+/).filter(Boolean);

    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0;i < lines.length;i++) {
        const line =lines[i].toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
            if (line.includes(keyword)) {
                score++;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    if (bestIndex === -1) {
        return content.slice(0, 2000);
    }

    const start =Math.max(0,bestIndex - 5);
    const end =Math.min(lines.length,bestIndex + 10);

    return lines.slice(start, end).join("\n");
}

module.exports = {extractRelevantSnippet};