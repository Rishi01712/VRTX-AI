// @ts-check

const fs = require("fs");
const vscode = require("vscode");
const path = require("path");

function getStoreDir() {
    const workspace =vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
        throw new Error("No workspace open");
    }

    return path.join(workspace,".semantic");
}

const STORE_DIR = getStoreDir();
const VECTOR_FILE =path.join( STORE_DIR,"vectors.json");

const META_FILE =path.join(STORE_DIR,"metadata.json");

function ensureStore() {
    if (!fs.existsSync(STORE_DIR)) {

        fs.mkdirSync( STORE_DIR,
            {
                recursive: true
            }
        );
    }

    if (!fs.existsSync(VECTOR_FILE)) {
        fs.writeFileSync(VECTOR_FILE,"[]");
    }

    if (!fs.existsSync( META_FILE)) {
        fs.writeFileSync(META_FILE,"{}");
    }
}

function loadVectors() {
    ensureStore();

    return JSON.parse(fs.readFileSync(VECTOR_FILE,"utf8"));
}

/**
 * @param {any[]} vectors
 */
function saveVectors(vectors) {
    ensureStore();

    fs.writeFileSync(VECTOR_FILE,
        JSON.stringify(
            vectors,
            null,
            2
        )
    );
}

function loadMetadata() {
    ensureStore();

    return JSON.parse(fs.readFileSync(META_FILE,"utf8"));
}

/**
 * @param {any} metadata
 */
function saveMetadata(metadata) {
    ensureStore();

    fs.writeFileSync(META_FILE,
        JSON.stringify(
            metadata,
            null,
            2
        )
    );
}

module.exports = {loadVectors,saveVectors,loadMetadata,saveMetadata};