import { State, Logic, Init, Event, View, emit, createUnorderedMap } from '@calimero/sdk';
import type { UnorderedMap } from '@calimero/sdk/collections';
import {
  blobAnnounceToContext,
  contextId,
  executorId,
  log,
  randomBytes,
  timeNow
} from '@calimero/sdk/env';
import bs58 from 'bs58';

const BLOB_ID_BYTES = 32;
const BYTES_PER_MB = 1024 * 1024;

function encodeBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

function decodeBase58(input: string, expectedLength: number): Uint8Array {
  const decoded = bs58.decode(input);
  if (decoded.length !== expectedLength) {
    throw new Error(`Value must decode to exactly ${expectedLength} bytes`);
  }
  return decoded;
}

function blobIdFromString(value: string): Uint8Array {
  return decodeBase58(value, BLOB_ID_BYTES);
}



function randomSuffix(bytes = 4): string {
  const buffer = new Uint8Array(bytes);
  randomBytes(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

type FileRecord = {
  id: string;
  name: string;
  blobId: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
};

@Event
export class FileUploaded {
  constructor(
    public id: string,
    public name: string,
    public size: number,
    public uploader: string
  ) {}
}

@Event
export class FileDeleted {
  constructor(public id: string, public name: string) {}
}



@State
export class FileShareState {
  owner: string = '';
  files: UnorderedMap<string, FileRecord> = createUnorderedMap<string, FileRecord>();
  fileCounter: number = 0;
}

@Logic(FileShareState)
export class FileShareLogic extends FileShareState {
  @Init
  static init(): FileShareState {
    try {
      const state = new FileShareState();
      state.owner = encodeBase58(executorId());
      const filesId = state.files?.id?.() ?? '<undefined>';
      const entryCount = state.files?.entries?.()?.length ?? '<n/a>';
      log(`[blobs] init owner=${state.owner} files.id=${filesId} entries=${entryCount}`);
      return state;
    } catch (error) {
      log(
        `[blobs] init failed error=${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  uploadFile({ name, blobId, size, mimeType }: { name: string; blobId: string; size: number; mimeType: string }): string {
    const files = this.files;
    const before = files.entries();
    log(
      `[blobs] uploadFile mapId=${files.id()} received name=${name ?? '<undefined>'} blobId=${blobId ?? '<undefined>'} size=${size ?? '<undefined>'} mimeType=${mimeType ?? '<undefined>'}`,
    );
    log(`[blobs] uploadFile typeof files=${files?.constructor?.name ?? '<unknown>'}`);
    log(`[blobs] uploadFile entries before=${before.length} keys=[${before.map(([key]) => key).join(', ')}]`);

    if (!name || !blobId) {
      throw new Error(
        `Both name and blobId are required (name=${String(name)} type=${typeof name}, blobId=${String(blobId)} type=${typeof blobId})`
      );
    }

    const blobBytes = blobIdFromString(blobId);

    const fileId = this.generateFileId();
    const uploader = encodeBase58(executorId());
    const timestamp = timeNow();

    const currentContext = contextId();
    const announced = blobAnnounceToContext(blobBytes, currentContext);
    log(
      `[blobs] announcing blob=${blobId} to context=${encodeBase58(currentContext)} announced=${announced}`
    );

    const record: FileRecord = {
      id: fileId,
      name,
      blobId,
      size,
      mimeType,
      uploadedBy: uploader,
      uploadedAt: timestamp.toString()
    };

    files.set(fileId, record);

    emit(new FileUploaded(fileId, name, size, uploader));
    const after = files.entries();
    log(
      `[blobs] stored file id=${fileId} name=${name} size=${size} mapId=${files.id()} entries after=${after.length} keys=[${after
        .map(([key]) => key)
        .join(', ')}]`,
    );

    return this.respond({ fileId });
  }

  deleteFile(fileId: string): string {
    const files = this.files;
    const record = files.get(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }

    files.remove(fileId);
    emit(new FileDeleted(fileId, record.name));
    log(`[blobs] deleted file id=${fileId}`);

    return 'true';
  }

  @View()
  listFiles(): string {
    const files = this.files;
    const entries = files.entries();
    log(
      `[blobs] listFiles mapId=${files.id()} entries count=${entries.length} keys=[${entries
        .map(([key]) => key)
        .join(', ')}]`
    );
    for (const [idx, [key, record]] of entries.entries()) {
      log(`[blobs] listFiles entry[${idx}] key=${key} value=${JSON.stringify(record)}`);
    }
    const items = entries.map(([, record]) => record);
    return this.respond({ files: items });
  }

  @View()
  getFile(fileId: string): string {
    const files = this.files;
    const record = files.get(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }
    return this.respond({ file: record });
  }

  @View()
  getBlobId(fileId: string): string {
    const files = this.files;
    const record = files.get(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }
    return this.respond({ blobId: record.blobId });
  }

  @View()
  searchFiles(query: string): string {
    const lowercase = query.toLowerCase();
    const files = this.files;
    const results = files
      .entries()
      .map(([, record]) => record)
      .filter(record => record.name.toLowerCase().includes(lowercase));

    log(`[blobs] search query="${query}" results=${results.length}`);
    return this.respond({ results });
  }

  @View()
  getStats(): string {
    const files = this.files;
    const totalFiles = files.entries().length;
    const totalBytes = files
      .entries()
      .reduce((sum: number, [, record]) => sum + record.size, 0);

    const totalMb = totalBytes / BYTES_PER_MB;

    return this.respond({
      totalFiles,
      totalBytes,
      totalMb: Number(totalMb.toFixed(2)),
      owner: this.owner
    });
  }

  @View()
  getTotalFilesSize(): string {
    const files = this.files;
    const totalBytes = files
      .entries()
      .reduce((sum: number, [, record]) => sum + record.size, 0);
    return this.respond({ totalBytes });
  }

  @View()
  getFileCount(): number {
    const files = this.files;
    const entries = files.entries();
    log(
      `[blobs] getFileCount mapId=${files.id()} typeof=${files.constructor.name} entries=${entries.length} keys=[${entries
        .map(([key]) => key)
        .join(', ')}]`,
    );
    return entries.length;
  }

  private generateFileId(): string {
    const suffix = randomSuffix();
    const id = `file_${this.fileCounter}_${suffix}`;
    this.fileCounter += 1;
    return id;
  }

  private respond(payload: unknown): string {
    return JSON.stringify(payload, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }
}



