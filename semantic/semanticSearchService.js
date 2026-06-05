// @ts-check

/**
 * @typedef {{
 * path:string,
 * chunkId:number,
 * chunkType?:string,
 * symbol?:string,
 * content:string,
 * embedding:number[],
 * language?:string,
 * imports?:string[],
 * symbols?:string[]
 * }} VectorEntry
 */
const {generateEmbedding} = require("./embeddingService");
const {getTable} = require("./lanceStore");

/**
 * @param {string} query
 * @param {number} topK
 */
async function semanticSearch(query,topK = 8) {

    console.log("QUERY:",query);

    // const expandedQuery =await expandQuery(query);
    // console.log("EXPANDED QUERY:",expandedQuery);
    // const queryEmbedding =await generateEmbedding(expandedQuery);

    
    const queryEmbedding =await generateEmbedding(query);
    // const queryWords =query.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
    
    const table =await getTable();
    const rows =await table.search(queryEmbedding).limit(topK * 4).toArray();
    
    return rows.map(row => ({
        path: 
            row.path,

        chunkId: 
            row.chunkId,

        chunkType: 
            row.chunkType,

        symbol: 
            row.symbol,

        content: 
            row.content,

        language: 
            row.language,

        imports:
            row.imports? row.imports.split("|"): [],
        
        symbols:
            row.symbols? row.symbols.split("|"): [],

        embedding: 
            row.embedding,

        score: 
            1 - (row._distance || 0)
    }));
}

/**
 * @typedef {{
 * path:string,
 * content:string,
 * score:number,
 * chunkId:number,
 * embedding:number[],
 * language?:string,
 * imports?:string[],
 * symbols?:string[]
 * }} SearchResult
 */

/**
 * @param {SearchResult[]} results
 */
function rerankResults(results) {

    /** @type {Map<string, any>} */
    const files = new Map();

    for (const result of results) {
        const current =files.get(result.path);
        if (!current) {
            files.set(result.path,
                {
                    ...result,
                    scores: [result.score]
                }
            );

            continue;
        }

        current.scores.push(result.score);
    }

    const reranked = [];
    for (const item of files.values()) {
        item.scores.sort(
            /**
            * @param {number} a
            * @param {number} b
            */
            (a, b) => b - a);

        const best =item.scores[0] || 0;
        const second =item.scores[1] || 0;
        const third =item.scores[2] || 0;

        const finalScore =best +(second * 0.5) +(third * 0.25);

        reranked.push({

            ...item,

            score:
                finalScore
        });
    }

    reranked.sort((a, b) =>b.score - a.score);
    return reranked;
}

module.exports = {semanticSearch, rerankResults};