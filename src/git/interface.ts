import {StatusResult} from "simple-git";

export interface IGitHandler {
    checkForChanges(): Promise<StatusResult | null>;
    commitChanges(status: StatusResult): Promise<void>;
    pushChanges(): Promise<void>;
}
