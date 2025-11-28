/**
 * Borsh Binary Decoder
 *
 * Mirrors the writer to parse primitive types from byte slices.
 */

export class BorshReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  readU8(): number {
    this.ensureAvailable(1);
    const value = this.bytes[this.offset];
    this.offset += 1;
    return value;
  }

  readU16(): number {
    this.ensureAvailable(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readU32(): number {
    this.ensureAvailable(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readU64(): bigint {
    this.ensureAvailable(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readF32(): number {
    this.ensureAvailable(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readF64(): number {
    this.ensureAvailable(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readFixedArray(length: number): Uint8Array {
    this.ensureAvailable(length);
    const start = this.offset;
    const end = start + length;
    const slice = this.bytes.subarray(start, end);
    this.offset = end;
    return new Uint8Array(slice);
  }

  readBytes(): Uint8Array {
    const length = this.readU32();
    return this.readFixedArray(length);
  }

  readString(): string {
    const bytes = this.readBytes();
    return new TextDecoder().decode(bytes);
  }

  /**
   * Get remaining bytes length
   */
  remaining(): number {
    return this.bytes.length - this.offset;
  }

  private ensureAvailable(length: number): void {
    if (this.offset + length > this.bytes.length) {
      throw new RangeError('BorshReader: unexpected end of buffer');
    }
  }
}
