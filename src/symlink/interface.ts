export interface ISymlinkHandler {

    createSystemSpecificSymlink(hexoSourcePath: string): Promise<string>;

    validateSymlink(hexoSourcePath: string): Promise<void>;
}
