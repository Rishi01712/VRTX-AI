// // @ts-check

// /** @type {{
//  * activeFile: string,
//  * recentFiles: string[],
//  * recentActions: string[],
//  * memory: string[],
//  * openedFiles: Record<string, string>
// }} */
// const runtimeState = {
//     activeFile: "",
//     recentFiles: [],
//     recentActions: [],
//     memory: [],
//     openedFiles: {}
// };

// /**
//  * @param {string} path
//  * @param {string} content
//  */
// function storeOpenedFile(path,content) {
//     runtimeState.activeFile =path;
//     runtimeState.openedFiles[path] = content;
//     if (!runtimeState.recentFiles.includes(path)) {
//         runtimeState.recentFiles.push(path);
//     }

//     if (runtimeState.recentFiles.length > 20) {
//         runtimeState.recentFiles.shift();
//     }
// }

// /**
//  * @param {string} path
//  */
// function getOpenedFile(path) {
//     return (runtimeState.openedFiles[path] ||null);
// }

// function getAllOpenedFiles() {
//     return runtimeState.openedFiles;
// }

// /**
//  * @param {string} action
//  */
// function addAction(action) {
//     runtimeState.recentActions.push(action);
//     if (runtimeState.recentActions.length > 30) {
//         runtimeState.recentActions.shift();
//     }
// }

// /**
//  * @param {string} item
//  */
// function addMemory(item) {
//     runtimeState.memory.push(item);
//     if (runtimeState.memory.length > 15) {
//         runtimeState.memory.shift();
//     }
// }

// function clearOpenedFiles() {
//     runtimeState.openedFiles = {};
// }

// function getRuntimeState() {
//     return runtimeState;
// }

// module.exports = {storeOpenedFile,getOpenedFile,getAllOpenedFiles,clearOpenedFiles,addAction,addMemory,getRuntimeState};