/**
 * Riseup Macro SDK — Files Module
 *
 * Provides marco.files.* methods for project-scoped file storage.
 *
 * See: spec/12-devtools-and-injection/sdk-convention.md §marco.files
 */

import { sendMessage } from "./bridge";

export interface FileEntry {
    filename: string;
    mimeType: string | null;
    size: number | null;
    createdAt: string;
}

export interface FileContent {
    content: string;
    mime: string | null;
}

export interface FilesApi {
    save(path: string, content: string, mime?: string): Promise<void>;
    read(path: string): Promise<FileContent>;
    delete(path: string): Promise<void>;
    list(): Promise<FileEntry[]>;
}

export function createFilesApi(): FilesApi {
    return {
        async save(path: string, content: string, mime?: string) {
            await sendMessage<void>("FILE_SAVE", { path, content, mime });
        },
        read(path: string) {
            return sendMessage<FileContent>("FILE_READ", { path });
        },
        async delete(path: string) {
            await sendMessage<void>("FILE_DELETE", { path });
        },
        list() {
            return sendMessage<FileEntry[]>("FILE_LIST");
        },
    };
}
