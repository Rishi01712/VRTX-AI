// @ts-check

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const lancedb = require("@lancedb/lancedb");

function getStoreDir() {
    const workspace =vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
        throw new Error("No workspace open");
    }

    return path.join(workspace,".semantic");
}

const STORE_DIR =getStoreDir();
function getMetaFile() {
    return path.join(getStoreDir(),"metadata.json");
}

async function getDB() {
    const dbPath =path.join(STORE_DIR,"lancedb");
    return await lancedb.connect(dbPath);
}

async function getTable() {
    const db =await getDB();

    const tables =await db.tableNames();
    if (tables.includes("vectors")) {
        return await db.openTable("vectors");
    }

    const table= await db.createTable(
        "vectors",
        [
            {
                path: "",
                chunkId: 0,
                chunkType: "",
                symbol: "",
                content: "",
                language: "",
                imports: "",
                symbols: "",
                embedding: Array(768).fill(0)
            }
        ]
    );
    await table.delete("chunkId = 0");
    return table;
}

function loadMetadata() {

    if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR,{recursive:true});
    }

    if (!fs.existsSync(getMetaFile())) {
        fs.writeFileSync(getMetaFile(),"{}");
    }

    return JSON.parse(
        fs.readFileSync(getMetaFile(),"utf8")
    );
}

/**
 * @param {Record<string,string>} metadata
 */
function saveMetadata(metadata) {

    fs.writeFileSync(getMetaFile(),
        JSON.stringify(
            metadata,
            null,
            2
        )
    );
}

module.exports = {getTable,loadMetadata,saveMetadata};