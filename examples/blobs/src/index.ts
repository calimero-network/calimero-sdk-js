import { State, Logic, Init, Event, emit } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';
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

function blobIdToString(value: Uint8Array): string {
  if (value.length !== BLOB_ID_BYTES) {
    throw new Error('Blob ID must be exactly 32 bytes');
  }
  return encodeBase58(value);
}

function randomSuffix(bytes = 4): string {
  const buffer = new Uint8Array(bytes);
  env.randomBytes(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class FileRecord {
  constructor(
    public id: string,
    public name: string,
    public blobId: Uint8Array,
    public size: number,
    public mimeType: string,
    public uploadedBy: string,
    public uploadedAt: bigint
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      blobId: blobIdToString(this.blobId),
      size: this.size,
      mimeType: this.mimeType,
      uploadedBy: this.uploadedBy,
      uploadedAt: this.uploadedAt.toString()
    };
  }
}

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
  owner: string;
  files: UnorderedMap<string, FileRecord>;
  fileCounter: number;

  constructor() {
    this.owner = '';
    this.files = new UnorderedMap<string, FileRecord>();
    this.fileCounter = 0;
  }
}

type UploadArgs = {
  name: string;
  blobId: string;
  size: number;
  mimeType: string;
};

@Logic(FileShareState)
export class FileShareLogic extends FileShareState {
  @Init
  static init(): FileShareState {
    const state = new FileShareState();
    state.owner = encodeBase58(env.executorId());
    env.log(`[blobs] initialized owner=${state.owner}`);
    return state;
  }

  uploadFile(args: UploadArgs): string {
    const { name, blobId, size, mimeType } = args;

    if (!name || !blobId) {
      throw new Error('Both name and blobId are required');
    }

    const blobBytes = blobIdFromString(blobId);

    const fileId = this.generateFileId();
    const uploader = encodeBase58(env.executorId());
    const timestamp = env.timeNow();

    const currentContext = env.contextId();
    const announced = env.blobAnnounceToContext(blobBytes, currentContext);
    env.log(
      `[blobs] announcing blob=${blobId} to context=${encodeBase58(currentContext)} announced=${announced}`
    );

    const record = new FileRecord(fileId, name, blobBytes, size, mimeType, uploader, timestamp);
    this.files.set(fileId, record);

    emit(new FileUploaded(fileId, name, size, uploader));
    env.log(`[blobs] stored file id=${fileId} name=${name} size=${size}`);

    return fileId;
  }

  deleteFile(fileId: string): string {
    const record = this.files.get(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }

    this.files.remove(fileId);
    emit(new FileDeleted(fileId, record.name));
    env.log(`[blobs] deleted file id=${fileId}`);

    return 'true';
  }

  listFiles(): string {
    const items = this.files.entries().map(([, record]) => record.toJSON());
    return this.respond({ files: items });
  }

  getFile(fileId: string): string {
    const record = this.files.get(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }
    return this.respond({ file: record.toJSON() });
  }

  getBlobId(fileId: string): string {
    const record = this.files.get(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }
    return blobIdToString(record.blobId);
  }

  searchFiles(query: string): string {
    const lowercase = query.toLowerCase();
    const results = this.files
      .entries()
      .filter(([, record]) => record.name.toLowerCase().includes(lowercase))
      .map(([, record]) => record.toJSON());

    env.log(`[blobs] search query="${query}" results=${results.length}`);
    return this.respond({ results });
  }

  getStats(): string {
    const totalFiles = this.files.entries().length;
    const totalBytes = this.files
      .entries()
      .reduce((sum, [, record]) => sum + record.size, 0);

    const totalMb = totalBytes / BYTES_PER_MB;

    return this.respond({
      totalFiles,
      totalBytes,
      totalMb: Number(totalMb.toFixed(2)),
      owner: this.owner
    });
  }

  getTotalFilesSize(): string {
    const totalBytes = this.files
      .entries()
      .reduce((sum, [, record]) => sum + record.size, 0);
    return this.respond({ totalBytes });
  }

  getFileCount(): number {
    return this.files.entries().length;
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

