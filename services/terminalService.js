// @ts-check

const { exec } = require("child_process");
const vscode = require("vscode");

/**
 * @param {string} command
 */
function runCommand(command) {

    return new Promise(resolve => {
        const workspace =vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        exec(command,
            {
                cwd: workspace,
                maxBuffer: 1024 * 1024 * 20
            },

            (error, stdout, stderr) => {

                resolve({
                    success:!error,
                    stdout,
                    stderr,
                    error:error?.message || null
                });
            }
        );
    });
}

module.exports = {runCommand};