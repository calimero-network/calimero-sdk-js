const NativeTextEncoder = globalThis.TextEncoder;
const NativeTextDecoder = globalThis.TextDecoder;

// QuickJS has no TextEncoder/TextDecoder, so load the polyfill with the globals removed.
function loadPolyfill(): { Encoder: typeof TextEncoder; Decoder: typeof TextDecoder } {
  const g = globalThis as any;
  delete g.TextEncoder;
  delete g.TextDecoder;
  try {
    jest.isolateModules(() => {
      require('../polyfills/text-encoding');
    });
    return { Encoder: g.TextEncoder, Decoder: g.TextDecoder };
  } finally {
    g.TextEncoder = NativeTextEncoder;
    g.TextDecoder = NativeTextDecoder;
  }
}

const { Encoder, Decoder } = loadPolyfill();

const STRINGS = [
  '',
  'bob',
  'boɢ',
  'café',
  '中文',
  '\u{1d538}',
  'a\u{20000}b\u{1d11e}c',
  '\u0000\u007f\u0080\u07ff\u0800\uffff',
  '\ud800',
  '\udc00',
  'x\ud835y',
  '\udd38\ud835',
  '\ud835\udd38\ud835',
];

const BYTES = [
  [0xe4, 0xb8, 0xad],
  [0xf0, 0x9f, 0x98, 0x80],
  [0xff],
  [0x80, 0x41],
  [0xc0, 0x80],
  [0xc3],
  [0xe0, 0x80, 0x80],
  [0xed, 0xa0, 0x80],
  [0xf0, 0x9f, 0x98],
  [0xf4, 0x90, 0x80, 0x80],
  [0xe2, 0x82, 0x41],
  [0xef, 0xbb, 0xbf, 0x61],
];

describe('TextEncoder/TextDecoder polyfill', () => {
  it('is installed only when the global is missing', () => {
    expect(Encoder).not.toBe(NativeTextEncoder);
    jest.isolateModules(() => {
      require('../polyfills/text-encoding');
    });
    expect(globalThis.TextEncoder).toBe(NativeTextEncoder);
    expect(globalThis.TextDecoder).toBe(NativeTextDecoder);
  });

  it('encodes distinct strings to distinct bytes', () => {
    const encoder = new Encoder();
    expect(Array.from(encoder.encode('boɢ'))).not.toEqual(Array.from(encoder.encode('bob')));
  });

  it.each(STRINGS)('encodes %j like the native UTF-8 encoder', str => {
    expect(Array.from(new Encoder().encode(str))).toEqual(
      Array.from(new NativeTextEncoder().encode(str))
    );
  });

  it.each(STRINGS)('round-trips %j like the native decoder', str => {
    const bytes = new NativeTextEncoder().encode(str);
    expect(new Decoder().decode(bytes)).toBe(new NativeTextDecoder().decode(bytes));
  });

  it.each(BYTES.map(bytes => [bytes]))('decodes %j like the native decoder', bytes => {
    const input = new Uint8Array(bytes);
    expect(new Decoder().decode(input)).toBe(new NativeTextDecoder().decode(input));
  });

  it('throws on invalid input when fatal', () => {
    expect(() => new Decoder('utf-8', { fatal: true }).decode(new Uint8Array([0xc3]))).toThrow(
      TypeError
    );
    expect(new Decoder('utf-8', { fatal: true }).decode(new Uint8Array([0xc3, 0xa9]))).toBe('é');
  });

  it('decodes a view over a larger buffer', () => {
    const view = new Uint8Array([0x61, 0xc3, 0xa9, 0x62]).subarray(1, 3);
    expect(new Decoder().decode(view)).toBe('é');
  });

  it('round-trips a large non-ASCII string', () => {
    const str = ('aé中' + String.fromCodePoint(0x1d538)).repeat(50_000);
    const bytes = new Encoder().encode(str);
    expect(Array.from(bytes)).toEqual(Array.from(new NativeTextEncoder().encode(str)));
    expect(new Decoder().decode(bytes)).toBe(str);
  });

  it('coerces a non-string argument like the native encoder', () => {
    const encode = (value: unknown) => Array.from(new Encoder().encode(value as string));
    expect(encode(123)).toEqual(Array.from(new NativeTextEncoder().encode('123')));
    expect(encode(null)).toEqual(Array.from(new NativeTextEncoder().encode('null')));
  });
});
