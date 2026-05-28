// // @ts-check

// const {findVariableAssignment} = require("./symbolService");
// /**
//  * @param {string} content
//  * @param {any} intent
//  */
// function buildPatch(content,intent) {
//     if (intent.type ==="variable_assignment") {
//         const oldLine =findVariableAssignment(content,intent.symbol);
//         if (!oldLine) {
//             return {
//                 success: false,
//                 error:
//                     "Assignment not found."
//             };
//         }

//         return {
//             success: true,
//             operation:
//                 "replace",
//             target:
//                 oldLine,
//             newText:
//                 `${intent.symbol} = ${intent.value}`
//         };
//     }

//     return {
//         success: false,
//         error:
//             "Unsupported patch type."
//     };
// }

// module.exports = {buildPatch};