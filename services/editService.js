// import fs from 'fs';
// import path from 'path';
// import * as vscode from 'vscode';

// /**
//  * @param {{
//  * path:string,
//  * content:string
//  * }} args
//  */
// export function modifyFileTool(args) {
//     try {
//         const workspaceFolder =vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
//         if (!workspaceFolder) {
//             throw new Error('No workspace open');
//         }

//         const requestedPath = args.path;
//         if (!requestedPath) {
//             throw new Error('No path provided');
//         }

//         const resolvedPath =path.isAbsolute(requestedPath)? requestedPath: path.resolve(workspaceFolder, requestedPath);
//         if (!resolvedPath.startsWith(workspaceFolder)) {
//             throw new Error(
//                 'Access denied: Cannot write files outside workspace'
//             );
//         }

//         const dir =path.dirname(resolvedPath);

//         if (!fs.existsSync(dir)) {
//             fs.mkdirSync(dir,{ recursive: true }
//             );
//         }

//         const content =args.content || '';

//         if (!content.trim()) {
//             throw new Error('Empty content received');
//         }

//         fs.writeFileSync(resolvedPath,content,'utf-8');

//         return {
//             success: true,
//             message:
//                 `Successfully wrote to ${requestedPath}`
//         };

//     } catch (err) {
//         return {
//             success: false,
//             error:
//                 err instanceof Error? err.message: String(err)
//         };
//     }
// }