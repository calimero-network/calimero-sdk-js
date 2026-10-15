/**
 * Embeds the ABI manifest as the `calimero_abi_v1` wasm custom section, which
 * is where the node reads an app's ABI (declared event handlers among it).
 */

const SECTION_NAME = 'calimero_abi_v1';
const WASM_HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]; // magic + version 1
const CUSTOM_SECTION_ID = 0;

const encoder = new TextEncoder();

/**
 * Returns a copy of `wasm` carrying exactly one `calimero_abi_v1` section with
 * `manifestJson`, replacing any existing one.
 */
export function embedAbiSection(wasm: Uint8Array, manifestJson: string): Uint8Array {
  if (wasm.length < WASM_HEADER.length || WASM_HEADER.some((byte, i) => wasm[i] !== byte)) {
    throw new Error('Cannot embed the ABI: input is not a wasm module');
  }

  const kept: Uint8Array[] = [wasm.subarray(0, WASM_HEADER.length)];
  let offset = WASM_HEADER.length;
  while (offset < wasm.length) {
    const id = wasm[offset];
    const [size, sizeLen] = readLeb(wasm, offset + 1);
    const end = offset + 1 + sizeLen + size;
    if (end > wasm.length) {
      throw new Error('Cannot embed the ABI: wasm section extends past the end of the module');
    }
    const payload = wasm.subarray(offset + 1 + sizeLen, end);
    if (!(id === CUSTOM_SECTION_ID && customSectionName(payload) === SECTION_NAME)) {
      kept.push(wasm.subarray(offset, end));
    }
    offset = end;
  }

  kept.push(customSection(SECTION_NAME, encoder.encode(manifestJson)));
  return concat(kept);
}

function customSectionName(payload: Uint8Array): string {
  const [len, lenLen] = readLeb(payload, 0);
  return new TextDecoder().decode(payload.subarray(lenLen, lenLen + len));
}

function customSection(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = encoder.encode(name);
  const payload = concat([writeLeb(nameBytes.length), nameBytes, data]);
  return concat([Uint8Array.of(CUSTOM_SECTION_ID), writeLeb(payload.length), payload]);
}

function readLeb(bytes: Uint8Array, start: number): [value: number, length: number] {
  let value = 0;
  for (let i = 0; i < 5 && start + i < bytes.length; i++) {
    const byte = bytes[start + i];
    value += (byte & 0x7f) * 2 ** (7 * i);
    if ((byte & 0x80) === 0) {
      return [value, i + 1];
    }
  }
  throw new Error('Cannot embed the ABI: malformed wasm section size');
}

function writeLeb(value: number): Uint8Array {
  const out: number[] = [];
  do {
    const byte = value & 0x7f;
    value = Math.floor(value / 128);
    out.push(value === 0 ? byte : byte | 0x80);
  } while (value !== 0);
  return Uint8Array.from(out);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
