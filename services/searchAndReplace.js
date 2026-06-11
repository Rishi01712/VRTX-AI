const fs = require("fs/promises");
const levenshtein = require("fast-levenshtein");

/**
 * @param {string} content
 * @param {string} search
 */
function findBestMatch(content, search) {

    const lines = content.split("\n");
    const searchLineCount = search.split("\n").length;

    let bestMatch = "";
    let bestDistance = Infinity;

    for (let i = 0; i < lines.length; i++) {

        const candidate = lines.slice(i, i + searchLineCount).join("\n");
        const distance = levenshtein.get(search, candidate);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = candidate;
        }
    }

    return {bestMatch,bestDistance};
}

/**
 * @param {string} filePath
 * @param {string} search
 * @param {string} replace
 * @param {"first"|"all"} [occurrence]
 */
async function searchAndReplace(filePath,search,replace,occurrence = "first") {
    
    const content = await fs.readFile(filePath,"utf8");

    let actualSearch = search;
    
    if (!content.includes(search)) {
        
        const fuzzy =findBestMatch(content, search);
        const similarity =1 - (fuzzy.bestDistance /Math.max(search.length, 1));

        if (similarity > 0.90) {
            actualSearch =fuzzy.bestMatch;

        } else {
            return {
                success: false,
                error: "Search text not found"
            };
        }
    }

    let updated;

    if (occurrence === "all" &&/^[A-Za-z_][A-Za-z0-9_]*$/.test(actualSearch)) {

        const regex =new RegExp(`\\b${actualSearch}\\b`, "g");
        updated =content.replace(regex, replace);
    }

    if (occurrence === "first") {
        updated = content.replace(actualSearch, replace);

    } else {
        updated = content.replaceAll(actualSearch, replace);
        // const escapedSearch =search.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        // const regex = new RegExp(`\\b${escapedSearch}\\b`,"g");

        // updated = content.replace(regex,replace);
    }

    await fs.writeFile(filePath,updated,"utf8");

    return {
        success: true,
        path: filePath,
        occurrence,
        requestedSearch: search,
        actualSearch,
        newCode: replace,
        changed: updated !== content
    };
}

module.exports = {searchAndReplace};