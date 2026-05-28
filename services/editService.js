// // @ts-check

// const fs = require("fs");
// /**
//  * @param {{
//  * path:string,
//  * operation:string,
//  * target?:string,
//  * newText?:string,
//  * functionName?:string,
//  * startAnchor?:string,
//  * endAnchor?:string,
//  * occurrence?:"first"|"last"|"all"
//  * }} args
//  */
// function modifyFileTool(args) {
//     try {
//         if (!args.path) {
//             return {
//                 success: false,
//                 error:
//                     "Missing file path."
//             };
//         }

//         if (!fs.existsSync(args.path)) {
//             return {
//                 success: false,
//                 error:
//                     "File does not exist."
//             };
//         }

//         let content =fs.readFileSync(args.path,"utf8");
        
//         if (args.operation ==="replace") {
//             if (!args.target) {
//                 return {
//                     success: false,
//                     error:
//                         "Missing target."
//                 };
//             }

//             const replacement =args.newText || "";
//             if (args.occurrence ==="last") {
//                 const index =content.lastIndexOf(args.target);
//                 if (index === -1) {
//                     return {
//                         success: false,
//                         error:
//                             "Target not found."
//                     };
//                 }
//                 content =content.slice(0, index)+replacement+content.slice(index +args.target.length);
//             }
//             else if (args.occurrence ==="all") {
//                 content =content.split(args.target).join(replacement);
//             }

//             else {
//                 const index =content.indexOf(args.target);
//                 if (index === -1) {
//                     return {
//                         success: false,
//                         error:
//                             "Target not found."
//                     };
//                 }
//                 content =content.slice(0, index)+replacement+content.slice(index +args.target.length);
//             }
//         }

//         else if (args.operation ==="replace_all") {
//             if (!args.target) {
//                 return {
//                     success: false,
//                     error:
//                         "Missing target."
//                 };
//             }

//             content =content.split(args.target).join(args.newText || "");
//         }

//         else if (args.operation ==="insert_after") {
//             if (!args.target) {
//                 return {
//                     success: false,
//                     error:
//                         "Missing target."
//                 };
//             }

//             const index =content.indexOf(args.target);
//             if (index === -1) {
//                 return {
//                     success: false,
//                     error:
//                         "Target not found."
//                 };
//             }
//             const insertIndex =index +args.target.length;
//             content =content.slice(0, insertIndex)+"\n"+(args.newText || "")+content.slice(insertIndex);
//         }

//         else if (args.operation ==="insert_before") {
//             if (!args.target) {
//                 return {
//                     success: false,
//                     error:
//                         "Missing target."
//                 };
//             }
//             const index =content.indexOf(args.target);
//             if (index === -1) {
//                 return {
//                     success: false,
//                     error:
//                         "Target not found."
//                 };
//             }
//             content =content.slice(0, index)+(args.newText || "")+"\n"+content.slice(index);
//         }

//         else if (args.operation ==="delete") {
//             if (!args.target) {
//                 return {
//                     success: false,
//                     error:
//                         "Missing target."
//                 };
//             }

//             /**
//             * @param {string} text
//             */
//             const normalize = text => text.replace(/\s+/g, "");
//             const normalizedContent =normalize(content);
//             const normalizedTarget =normalize(args.target);
//             const index =normalizedContent.indexOf(normalizedTarget);

//             if (index === -1) {
//                 return {
//                     success:false,
//                     error:"Target not found."
//                 };
//             }

//             if (content.includes(args.target)) {
//                 content =content.replace(args.target,args.newText || "");
//             }
//             else {
//                 const lines =content.split("\n");
//                 const targetNorm =normalize(args.target);
//                 for (let i = 0;i < lines.length;i++) {
//                     if (normalize(lines[i]) ===targetNorm) {
//                         lines[i] =args.newText || "";
//                         break;
//                     }
//                 }
//                 content =lines.join("\n");
//             }
//         }

//         else if (args.operation ==="append") {
//             content += "\n" +(args.newText || "");
//         }

//         else if (args.operation ==="prepend") {
//             content =(args.newText || "")+"\n"+content;
//         }

//         else if (args.operation ==="replace_between") {
//             if (!args.startAnchor ||!args.endAnchor) {
//                 return {
//                     success: false,
//                     error:
//                         "replace_between requires startAnchor and endAnchor."
//                 };
//             }

//             const start =content.indexOf(args.startAnchor);
//             const end =content.indexOf(args.endAnchor,start);

//             if (start === -1 ||end === -1) {
//                 return {
//                     success: false,
//                     error:
//                         "Anchors not found."
//                 };
//             }
//             content =content.slice(0, start)+(args.newText || "")+content.slice(end);
//         }

//         else if (args.operation ==="replace_function") {
//             if (!args.functionName) {
//                 return {
//                     success: false,
//                     error:
//                         "Missing function name."
//                 };
//             }

//             let regex =new RegExp(`function\\s+${args.functionName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`,"m");
//             if (!regex.test(content)) {
//                 regex =new RegExp(`${args.functionName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\}`,"m");
//             }

//             if (!regex.test(content)) {
//                 regex =new RegExp(`${args.functionName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`,"m");
//             }

//             if (!regex.test(content)) {
//                 return {
//                     success: false,
//                     error:
//                         "Function not found."
//                 };
//             }

//             content =content.replace(regex,args.newText || "");
//         }

//         else {
//             return {
//                 success: false,
//                 error:
//                     "Unknown operation."
//             };
//         }

//         fs.writeFileSync( args.path,content,"utf8");
//         return {
//             success: true,
//             path:
//                 args.path,

//             operation:
//                 args.operation,

//             preview:
//                 content.slice(0, 500)
//         };
//     } catch (err) {
//         return {
//             success: false,
//             error:
//                 err instanceof Error? err.message: "Unknown error"
//         };
//     }
// }
// module.exports = {modifyFileTool};







// @ts-check
const fs = require("fs");

/**
 * @param {{
 * path:string,
 * operation:string,
 * target?:string,
 * newText?:string,
 * functionName?:string
 * }} args
 */

function modifyFileTool(args) {
    try {
        let content = fs.readFileSync(args.path, "utf8");

        if (args.operation ==="replace") {
            if ( !args.target) {
                return {
                    success: false,
                    error:
                        "Missing target."
                };
            }

            content =content.replace(args.target,args.newText || "");
        }

        else if ( args.operation ==="replace_all") {
            if (!args.target) {
                return {
                    success: false,
                    error:
                        "Missing target."
                };
            }

            content =content.split( args.target).join(args.newText || "");
        }

        else if (args.operation ==="insert_after") {
            if (!args.target) {
                return {
                    success: false,
                    error:
                        "Missing target."
                };
            }

            content =content.replace(args.target,args.target +"\n" +(args.newText || ""));
        }

        else if (args.operation ==="insert_before") {
            if (!args.target) {
                return {
                    success: false,
                    error:
                        "Missing target."
                };
            }

            content =content.replace(args.target,(args.newText || "") + "\n" +args.target);
        }

        else if (args.operation ==="delete") {
            if (!args.target) {
                return {
                    success: false,
                    error:
                        "Missing target."
                };
            }

            content =content.replace(args.target,"");
        }

        else if (args.operation ==="append") {
            content +="\n" +(args.newText || "");
        }

        else if ( args.operation ==="prepend") {
            content =(args.newText || "") +"\n" +content;
        }

        else if (args.operation ==="replace_function") {
            if (!args.functionName) {
                return {
                    success: false,
                    error:
                        "Missing function name."
                };
            }

            const regex =new RegExp(`function\\s+${args.functionName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`,"m");

            if (!regex.test(content)) {
                return {
                    success: false,
                    error:
                        "Function not found."
                };
            }

            content =content.replace(regex,args.newText || "");
        }

        else {
            return {
                success: false,
                error:
                    "Unknown operation."
            };
        }

        fs.writeFileSync(args.path,content,"utf8");
        return {
            success: true,
            path:
                args.path,

            operation:
                args.operation
        };

    } catch (err) {
        return {
            success: false,
            error: err instanceof Error? err.message: "Unknown error"
        };
    }
}
module.exports = {modifyFileTool};