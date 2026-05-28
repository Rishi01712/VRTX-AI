// // @ts-check

// /**
//  * @param {string} prompt
//  */
// function extractEditIntent(prompt) {
//     const fileMatch =prompt.match(/\b([\w.-]+\.(js|ts|py|cpp|java))\b/i);
//     const file =fileMatch?.[1] || null;

//     const assignmentMatch =prompt.match(/(?:change|replace|update|modify|set)(?:\s+the)?\s+([a-zA-Z_]\w*)/i);
//     const valueMatch =prompt.match(/\[[^\]]+\]/);

//     if (assignmentMatch &&valueMatch) {
//         return {
//             type:
//                 "variable_assignment",
//             symbol:
//                 assignmentMatch[1],
//             value:
//                 valueMatch[0],
//             file
//         };
//     }

//     const functionMatch =prompt.match(/function\s+(\w+)/i);

//     if (functionMatch) {
//         return {
//             type:
//                 "function_edit",
//             symbol:
//                 functionMatch[1],
//             file
//         };
//     }

//     return {
//         type:
//             "unknown",
//         file
//     };
// }

// module.exports = {extractEditIntent};