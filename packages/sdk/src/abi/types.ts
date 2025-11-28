/**
 * ABI Type definitions shared between build-time and runtime
 *
 * These types match the Rust ABI schema format to ensure compatibility
 * with merodb and other Calimero tooling.
 */

export interface AbiManifest {
  schema_version: string;
  types: Record<string, TypeDef>;
  methods: Method[];
  events: Event[];
  state_root?: string;
}

export interface TypeDef {
  kind: 'record' | 'variant' | 'bytes' | 'alias';
  fields?: Field[];
  variants?: Variant[];
  size?: number;
  encoding?: string;
  target?: TypeRef;
}

export interface Field {
  name: string;
  type: TypeRef;
  nullable?: boolean;
}

export interface Variant {
  name: string;
  code?: string;
  payload?: TypeRef;
}

export interface Method {
  name: string;
  params: Parameter[];
  returns?: TypeRef;
  is_init?: boolean;
  is_view?: boolean;
}

export interface Parameter {
  name: string;
  type: TypeRef;
}

export interface Event {
  name: string;
  fields: Field[];
}

export interface TypeRef {
  kind: 'scalar' | 'option' | 'vector' | 'map' | 'set' | 'reference';
  scalar?: ScalarType;
  inner?: TypeRef;
  key?: TypeRef;
  value?: TypeRef;
  name?: string;
}

export type ScalarType =
  | 'bool'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'i8'
  | 'i16'
  | 'i32'
  | 'i64'
  | 'i128'
  | 'f32'
  | 'f64'
  | 'string'
  | 'bytes';

// Extend global types for ABI access
declare global {
  var __CALIMERO_ABI_MANIFEST__: AbiManifest | undefined;
  var get_abi_ptr: () => string;
  var get_abi_len: () => number;
  var get_abi: () => string;
}
