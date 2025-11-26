/**
 * TextEncoder/TextDecoder polyfill for QuickJS
 */

// TODO: Improve the TextEncode/TextDecoder polyfills to handle bigint/UTF-8 encoding/decoding correctly

// Simple TextEncoder polyfill
if (typeof TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = class TextEncoder {
    encode(str: string): Uint8Array {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
      }
      return bytes;
    }
  };
}

// Simple TextDecoder polyfill
if (typeof TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = class TextDecoder {
    decode(bytes: Uint8Array): string {
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      return str;
    }
  };
}
