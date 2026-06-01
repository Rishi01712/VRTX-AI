// @ts-check

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

/** @type {string[]} */
let cachedFiles = [];

async function indexWorkspaceFiles() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        return;
    }
    cachedFiles = [];
    const rootPath = folders[0].uri.fsPath;

    /**
     * @param {string} dir
     */
    function scan(dir) {
        let files = [];
        try {
            files = fs.readdirSync(dir);
        } catch {
            return;
        }
        for (const file of files) {
            if (
                file === "node_modules" ||
                file === ".git" ||
                file === "dist" ||
                file === "build" ||
                file === ".next" ||
                file === ".vscode" ||
                file === ".semantic"
            ) {
                continue;
            }

            const fullPath = path.join(dir, file);
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch {
                continue;
            }

            if (stat.isDirectory()) {
                scan(fullPath);
                continue;
            }

            cachedFiles.push(fullPath);
        }
    }
    scan(rootPath);
    console.log( "INDEXED FILES:", cachedFiles.length);
}

/**
 * @param {string} file
 * @param {string[]} tokens
 */
function scoreFileMatch(file,tokens) {
    const filename =path.basename(file).toLowerCase();
    const parsed =path.parse(filename);

    let score = 0;
    for (const token of tokens) {
        const normalized = token.toLowerCase();
        if (filename === normalized) {
            score += 1000;
        }
        else if (
            parsed.name === path.parse(normalized).name
        ) {
            score += 500;
        }
        else if (
            filename.startsWith(normalized)
        ) {
            score += 100;
        }
        else if (
            filename.includes(normalized)
        ) {
            score += 25;
        }
    }
    return score;
}

/**
 * @param {string} query
 */
async function findRelevantFiles(query) {
    const normalized =query.toLowerCase().trim();

    const tokens =normalized.match(/[a-zA-Z0-9_.-]+/g) || [];
    const ranked =cachedFiles.map(file => ({file, score:scoreFileMatch(file,tokens)}))

            .filter(item =>
                item.score > 0
            )
            .sort((a, b) =>
                b.score - a.score
            )
            .map(item =>
                item.file
            );

    return [ ...new Set(ranked)].slice(0, 10);
}

/**
 * @param {{ path: string }} args
 */
function readFileTool(args) {
    try {
        const normalized =args.path.toLowerCase().trim();
        let matched = cachedFiles.find(file =>
                path.basename(file).toLowerCase()===normalized);

        if (!matched) {
            matched =cachedFiles.find(file => 
                path.parse(file).name.toLowerCase()===path.parse(normalized).name.toLowerCase()
            );
        }

        if (!matched) {
            matched =cachedFiles.find(file =>
                    file.toLowerCase().endsWith(normalized)
            );
        }

        if (!matched) {
            return {
                success: false,
                error:
                    `File not found: ${args.path}`
            };
        }

        const content =fs.readFileSync(matched,"utf8");
        return {
            success: true,
            path:
                matched,
            content:
                content.slice(0, 4000)
        };
    } catch (err) {
        return {
            success: false,
            error:
                err instanceof Error? err.message: "Unknown error"
        };
    }
}

/**
 * @param {string} filePath
 */
function readFileContent(filePath) {
    try {
        const content =fs.readFileSync(filePath,"utf8");
        return content.slice(0, 4000);
    } catch {
        return "Unable to read file.";
    }
}

function getWorkspaceTree() {
    const folders =vscode.workspace.workspaceFolders;
    if (!folders) {
        return "";
    }
    const rootPath =folders[0].uri.fsPath;

    /**
     * @param {string} dir
     * @param {string} prefix
     */
    function buildTree(dir,prefix = "") {
        let output = "";
        let entries = [];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            return "";
        }
        entries =entries.filter(entry =>
                ![
                    "node_modules",
                    ".git",
                    "dist",
                    "build",
                    ".next",
                    ".vscode",
                    ".semantic"
                ].includes(entry)
            );

        entries.forEach((entry, index) => {
            const fullPath =path.join(dir, entry);
            let stat;

            try {
                stat =fs.statSync(fullPath);
            } catch {
                return;
            }
            const isLast =index === entries.length - 1;
            const connector =isLast
                    ? "└── "
                    : "├── ";

            output +=prefix +connector +entry +"\n";
            if (stat.isDirectory()) {
                const nextPrefix =prefix +(isLast ? "    ": "│   ");
                output +=buildTree(fullPath,nextPrefix);
            }
        });

        return output;
    }
    return buildTree(rootPath);
}

function getIndexedFiles() {
    return cachedFiles;
}

/**
 * @param {{ folder: string }} args
 */

module.exports = {indexWorkspaceFiles,findRelevantFiles,readFileContent,readFileTool,getWorkspaceTree,getIndexedFiles};
