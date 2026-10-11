/**
 * TextEncoder/TextDecoder polyfill for QuickJS, following the WHATWG UTF-8 encode/decode algorithms.
 */

const REPLACEMENT = 0xfffd;
const DECODE_CHUNK = 8192; // code units per String.fromCharCode call, below engine argument limits

if (typeof TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = class TextEncoder {
    readonly encoding = 'utf-8';

    encode(input: string = ''): Uint8Array {
      const str = String(input);
      const out: number[] = [];
      for (let i = 0; i < str.length; i++) {
        let cp = str.charCodeAt(i);
        if (cp >= 0xd800 && cp <= 0xdfff) {
          const next = str.charCodeAt(i + 1);
          if (cp <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
            cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
            i++;
          } else {
            cp = REPLACEMENT;
          }
        }
        if (cp < 0x80) {
          out.push(cp);
        } else if (cp < 0x800) {
          out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp < 0x10000) {
          out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
          out.push(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f)
          );
        }
      }
      return new Uint8Array(out);
    }
  };
}

if (typeof TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = class TextDecoder {
    readonly encoding = 'utf-8';
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;

    constructor(_label = 'utf-8', options: { fatal?: boolean; ignoreBOM?: boolean } = {}) {
      this.fatal = options.fatal === true;
      this.ignoreBOM = options.ignoreBOM === true;
    }

    decode(input?: ArrayBuffer | ArrayBufferView): string {
      const bytes =
        input === undefined
          ? new Uint8Array(0)
          : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : new Uint8Array(input);
      const units: number[] = [];
      let i = 0;
      while (i < bytes.length) {
        const lead = bytes[i++];
        if (lead < 0x80) {
          units.push(lead);
          continue;
        }
        let needed: number;
        let cp: number;
        let lower = 0x80;
        let upper = 0xbf;
        if (lead >= 0xc2 && lead <= 0xdf) {
          needed = 1;
          cp = lead & 0x1f;
        } else if (lead >= 0xe0 && lead <= 0xef) {
          needed = 2;
          cp = lead & 0x0f;
          if (lead === 0xe0) lower = 0xa0;
          if (lead === 0xed) upper = 0x9f;
        } else if (lead >= 0xf0 && lead <= 0xf4) {
          needed = 3;
          cp = lead & 0x07;
          if (lead === 0xf0) lower = 0x90;
          if (lead === 0xf4) upper = 0x8f;
        } else {
          units.push(this.replacement());
          continue;
        }
        // A byte that breaks the sequence is not consumed, so it starts the next one.
        while (needed > 0 && i < bytes.length && bytes[i] >= lower && bytes[i] <= upper) {
          cp = (cp << 6) | (bytes[i++] & 0x3f);
          lower = 0x80;
          upper = 0xbf;
          needed--;
        }
        if (needed > 0) {
          units.push(this.replacement());
        } else if (cp >= 0x10000) {
          units.push(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
        } else {
          units.push(cp);
        }
      }
      const start = !this.ignoreBOM && units[0] === 0xfeff ? 1 : 0;
      // Chunked rather than per-character concatenation, which is quadratic in QuickJS.
      const chunks: string[] = [];
      for (let i = start; i < units.length; i += DECODE_CHUNK) {
        chunks.push(String.fromCharCode.apply(null, units.slice(i, i + DECODE_CHUNK)));
      }
      return chunks.join('');
    }

    private replacement(): number {
      if (this.fatal) {
        throw new TypeError('The encoded data was not valid utf-8');
      }
      return REPLACEMENT;
    }
  };
}
