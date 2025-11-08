/**
 * Borsh Binary Encoder
 * 
 * Implements the Borsh serialization format to match Rust's borsh crate
 * https://borsh.io/
 */

export class BorshWriter {
  private buffer: number[] = [];

  /**
   * Write a single byte (u8)
   */
  writeU8(value: number): void {
    this.buffer.push(value & 0xff);
  }

  /**
   * Write a 32-bit unsigned integer (u32) in little-endian
   */
  writeU32(value: number): void {
    this.buffer.push(value & 0xff);
    this.buffer.push((value >> 8) & 0xff);
    this.buffer.push((value >> 16) & 0xff);
    this.buffer.push((value >> 24) & 0xff);
  }

  /**
   * Write a 64-bit unsigned integer (u64) in little-endian
   */
  writeU64(value: bigint): void {
    const num = BigInt(value);
    for (let i = 0; i < 8; i++) {
      this.buffer.push(Number((num >> BigInt(i * 8)) & BigInt(0xff)));
    }
  }

  /**
   * Write a 64-bit floating point number (f64) in little-endian
   */
  writeF64(value: number): void {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) {
      this.buffer.push(view.getUint8(i));
    }
  }

  /**
   * Write a fixed-size byte array
   */
  writeFixedArray(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
  }

  /**
   * Write a variable-length byte array (u32 length + bytes)
   */
  writeBytes(bytes: Uint8Array): void {
    this.writeU32(bytes.length);
    this.writeFixedArray(bytes);
  }

  /**
   * Write a vector (u32 length + items)
   */
  writeVec<T>(items: T[], writeFn: (item: T) => void): void {
    this.writeU32(items.length);
    for (const item of items) {
      writeFn(item);
    }
  }

  /**
   * Write a string (u32 length + UTF-8 bytes)
   */
  writeString(str: string): void {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6));
        bytes.push(0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12));
        bytes.push(0x80 | ((code >> 6) & 0x3f));
        bytes.push(0x80 | (code & 0x3f));
      }
    }
    this.writeU32(bytes.length);
    for (const byte of bytes) {
      this.buffer.push(byte);
    }
  }

  /**
   * Write an Option (1 byte + value if Some)
   */
  writeOption<T>(value: T | null | undefined, writeFn: (item: T) => void): void {
    if (value === null || value === undefined) {
      this.writeU8(0); // None
    } else {
      this.writeU8(1); // Some
      writeFn(value);
    }
  }

  /**
   * Get the serialized bytes
   */
  toBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.buffer.length;
  }
}

