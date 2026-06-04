// @ts-check

/**
 * @param {string} prompt
 */
function detectIntent(prompt) {
    const p = prompt.toLowerCase();

    if (/(which file|what file|where is|which module|contains|uses|imports|related to|predicts|defined in)/i.test(p)) {
        return "file_lookup";
    }

    if (/(bug|bugs|logic error|logic errors|issue|issues|problem|problems|vulnerability|vulnerabilities|unsafe|crash|exception|debug|fault)/i.test(p)) {
        return "bug_analysis";
    }

    if (/(workflow|flow|architecture|how does|explain project|data flow|execution flow|trace execution|project structure)/i.test(p)) {
        return "project_analysis";
    }

    if (/(modify|edit|rewrite|replace|refactor|remove|delete|add|update)/i.test(p)) {
        return "edit";
    }

    return "general";
}


/**
 * @param {any[]} files
 */
function buildAnalysisContext(files) {
    let context ="PROJECT ANALYSIS CONTEXT\n\n";
    for (const file of files) {
        context += `
            FILE:
            ${file.path}

            CONTENT:
            ${file.content}

            ------------------------
            `;
    }

    return context;
}

module.exports = { buildAnalysisContext,detectIntent };