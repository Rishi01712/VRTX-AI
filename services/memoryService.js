// // @ts-check

// const fs = require("fs");
// const path = require("path");

// const historyPath = path.join(__dirname,"..","chatHistory.json");

// function loadChatHistory() {
//     try {
//         if (!fs.existsSync(historyPath)) {
//             return [];
//         }

//         const raw = fs.readFileSync(historyPath,"utf8");
//         return JSON.parse(raw);
//     } catch {
//         return [];
//     }
// }

// /**
//  * @param {any[]} messages
//  */
// function saveChatHistory(messages) {
//     try {
//         fs.writeFileSync( historyPath,
//             JSON.stringify(
//                 messages,
//                 null,
//                 2
//             )
//         );
//     } catch (err) {
//         console.error("CHAT MEMORY SAVE ERROR:",err);
//     }
// }

// /**
//  * @param {{
//  * role:string,
//  * content:string
//  * }} message
//  */
// function appendMessage(message) {
//     const history = loadChatHistory();
//     history.push(message);

//     const trimmed = history.slice(-20);
//     saveChatHistory(trimmed);
// }

// module.exports = { loadChatHistory, saveChatHistory, appendMessage };