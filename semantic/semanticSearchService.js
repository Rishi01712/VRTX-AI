// @ts-check

/**
 * @typedef {{
 * path:string,
 * chunkId:number,
 * content:string,
 * embedding:number[],
 * language?:string,
 * imports?:string[],
 * symbols?:string[]
 * }} VectorEntry
 */
const {generateEmbedding} = require("./embeddingService");
const {loadVectors} = require("./vectorStore");
// const {expandQuery} = require("./queryExpansionService");

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function cosineSimilarity(a,b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0;i < a.length;i++) {
        dot +=a[i] * b[i];
        magA +=a[i] * a[i];
        magB +=b[i] * b[i];
    }

    if (magA === 0 ||magB === 0) {
        return 0;
    }

    return (dot /(Math.sqrt(magA) *Math.sqrt(magB)));
}

/**
 * @param {string} query
 * @param {number} limit
 */
async function semanticSearch(query,limit = 10) {

    /** @type {VectorEntry[]} */
    const vectors =loadVectors();
    console.log("FIRST VECTOR:",JSON.stringify(vectors[0],null,2));
    console.log("QUERY:",query);

    if (vectors.length === 0) {
        return [];
    }

    // const expandedQuery =await expandQuery(query);
    // console.log("EXPANDED QUERY:",expandedQuery);
    // const queryEmbedding =await generateEmbedding(expandedQuery);

    
    const queryEmbedding =await generateEmbedding(query);
    const queryWords =query.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
    
    const scored = vectors.map(/** @param {VectorEntry} item */
        
        item => {
            let score =cosineSimilarity(queryEmbedding,item.embedding);
            const lowerContent =item.content.toLowerCase();
            
            for (const word of queryWords) {
                if (lowerContent.includes(word)) {
                    score += 0.5;
                }

                if (item.symbols?.some(symbol =>
                        symbol.toLowerCase().includes(word)
                    )) {
                    score += 3;
                }

                if (item.imports?.some(
                        imp =>
                            imp.toLowerCase().includes(word)
                    )) {
                    score += 2;
                }

                if (item.path.toLowerCase().includes(word)) {
                    score += 5;
                }
            }

            return {
                ...item,
                score
            };
        }
    );

    scored.sort((a, b) =>b.score - a.score);
    return scored.slice(0,limit);
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