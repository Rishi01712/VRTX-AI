const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const MEMORY_DIR = path.join(__dirname, "..", "memory");
const THREADS_FILE = path.join(MEMORY_DIR, "threads.json");
const CHATS_DIR = path.join(MEMORY_DIR, "chats");

async function createThread(title = "New Chat") {

    const id = crypto.randomUUID();
    const thread = {
        id,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const threads = JSON.parse(await fs.readFile(THREADS_FILE,"utf8"));
    threads.unshift(thread);

    await fs.writeFile(THREADS_FILE,
        JSON.stringify(
            threads,
            null,
            2
        )
    );

    await fs.writeFile(path.join(CHATS_DIR,`${id}.json`),
        JSON.stringify({
            id,
            messages: []
        })
    );

    return id;
}

/**
 * @param {string} threadId
 */
async function loadThread(threadId) {

    const file =path.join(CHATS_DIR,`${threadId}.json`);

    return JSON.parse(await fs.readFile(file,"utf8"));
}

/**
 * @param {string} threadId
 * @param {{
 *   role: string,
 *   content: string
 * }} message
 */
async function appendMessage(threadId, message) {

    const thread = await loadThread(threadId);
    thread.messages.push(message);
    thread.updatedAt = new Date().toISOString();


    const threads = await getAllThreads();
    const meta = threads.find(
        /** @param {{id:string,title:string}} t */
        t => t.id === threadId
    );
    
    if (meta) {
        meta.updatedAt = new Date().toISOString();
        
        await fs.writeFile(THREADS_FILE,
        JSON.stringify(
            threads,
            null,
            2
        ));
    }

    await fs.writeFile(path.join(CHATS_DIR, `${threadId}.json`),
        JSON.stringify(
            thread,
            null,
            2
        )
    );
}

/**
 * @param {string} threadId
 * @param {string} title
 */
async function updateThreadTitle(threadId, title) {

    const threads = await getAllThreads();
    const thread = threads.find(
        /** @param {{id:string,title:string}} t */
        t => t.id === threadId
    );

    if (!thread) {
        return;
    }

    thread.title = title;
    thread.updatedAt = new Date().toISOString();

    await fs.writeFile(THREADS_FILE,
        JSON.stringify(
            threads,
            null,
            2
        )
    );
}

async function getAllThreads() {

    return JSON.parse(await fs.readFile(THREADS_FILE,"utf8"));
}

/** @type {string | null} */
let currentThreadId = null;

/**
 * @param {string} id
 */
function setThread(id) {
    currentThreadId = id;
}

function getThread() {
    return currentThreadId;
}


module.exports = {createThread,loadThread,appendMessage,updateThreadTitle,getAllThreads,setThread,getThread};