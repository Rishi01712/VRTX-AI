// @ts-check

/**
 * @param {string} prompt
 */
function detectIntent(prompt) {

    const p = prompt.toLowerCase();

    const terminalKeywords = ["git","branch","commit","checkout","merge","rebase","npm","pnpm","yarn","python","node","docker","terminal","command","run","execute","pip","cargo","gradle","maven","powershell","cmd","shell","build","start","dev","test"];

    if (terminalKeywords.some(keyword => p.includes(keyword))) {
        return "terminal";
    }

    const workspaceKeywords = ["file","folder","class","function","method","module","workspace","project","codebase","bug","error","issue","explain","analyze","where is","which file","modify","edit","rewrite","refactor","update","delete","add"];

    if (workspaceKeywords.some(keyword => p.includes(keyword))) {
        return "workspace";
    }

    return "general";
}

module.exports = {detectIntent};