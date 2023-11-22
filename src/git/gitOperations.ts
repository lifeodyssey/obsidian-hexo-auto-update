import {SimpleGit, StatusResult} from "simple-git";

export async function checkForChanges(git: SimpleGit): Promise<StatusResult | null> {
    const status = await git.status();
    // check if any of the changes contain '_posts' in their directory path
    const changesInPosts = status.files.some(file => /_posts/.test(file.path));
    if (changesInPosts) {
        // if there are changes in the '_posts' directory, return the status
        return status;
    } else {
        // otherwise, return null
        return null
    }
}

export async function commitChanges(git: SimpleGit, status: StatusResult): Promise<void> {
    const timestamp = new Date().toISOString();

    // Categorize files based on their status
    const addedFiles = status.created.map(file => `A: ${file}`).join(', ');
    const modifiedFiles = status.modified.map(file => `M: ${file}`).join(', ');
    const deletedFiles = status.deleted.map(file => `D: ${file}`).join(', ');

    // Construct the commit message
    const commitMessage = `Changes at ${timestamp} - ${addedFiles} ${modifiedFiles} ${deletedFiles}`.trim();

    await git.add('.'); // Stage all changes
    await git.commit(commitMessage);
}

export async function pushChanges(git: SimpleGit): Promise<void> {
    await git.push();
}
