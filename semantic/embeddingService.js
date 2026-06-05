// @ts-check

const { getIndexedFiles } =require("../services/fileService");
const { createSemanticChunks} =require("./chunkService");
const {getTable,loadMetadata,saveMetadata} = require("./lanceStore");
const {extractSymbols,generateSummary} = require("./symbolService");

const fs = require("fs");
const crypto = require("crypto");

const ollamaModule =require("ollama");
const ollama =new ollamaModule.Ollama({host:"http://127.0.0.1:11434"});

/**
 * @param {string} text
 */
async function generateEmbedding(text) {
    const result =await ollama.embeddings({
            model:
                "nomic-embed-text",
            prompt:
                text
        });

    return (result.embedding || []);
}

/**
 * @param {string} content
 */
function hashContent(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}

async function buildSemanticIndex() {
    console.log("SEMANTIC INDEXING STARTED");
    const files =getIndexedFiles();
    const metadata =loadMetadata();

    for (const file of files) {
        try {
            const content =fs.readFileSync(file,"utf8");
            const symbols =extractSymbols(content);
            const summary =generateSummary(file,content,symbols);
            const hash =hashContent(content);

            if (metadata[file] === hash) {
                continue;
            }

            console.log("INDEXING:",file);

            const table =await getTable();
            console.log(await table.countRows());
            await table.delete(`path='${file.replace(/'/g,"''")}'`);

            const chunks =createSemanticChunks(content,summary.language);
            console.log("CHUNKS:",file,chunks.length);

            const batch = [];
            for (let i = 0;i < chunks.length;i++) {
                const semanticChunk =chunks[i];
                const embeddingText = `
                    FILE:
                    ${file}

                    LANGUAGE:
                    ${summary.language}

                    IMPORTS:
                    ${summary.imports.join("\n")}

                    SYMBOLS:
                    ${summary.symbols.join(", ")}

                    CONTENT:
                    ${semanticChunk.content}
                `;

                const embedding =await generateEmbedding(embeddingText);

                batch.push({
                    path:file,

                    chunkId:i,

                    chunkType:
                        semanticChunk.type,

                    symbol:
                        semanticChunk.symbol,

                    content:
                        semanticChunk.content,

                    language:
                        summary.language,

                    imports:
                        summary.imports.join("|"),

                    symbols:
                        summary.symbols.join("|"),

                    embedding
                });
            }
            await table.add(batch);
            metadata[file] =hash;

        } catch (err) {
            console.error("INDEX ERROR:",file,err);
        }
    }
    saveMetadata(metadata);

    console.log("SEMANTIC INDEX READY");
}

module.exports = {generateEmbedding, buildSemanticIndex};