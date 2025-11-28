/**
 * ABI Conformance Test Example
 *
 * This file is used to test ABI generation and verify it matches expected output.
 * It should generate the same ABI as the Rust version:
 * https://github.com/calimero-network/core/blob/master/apps/abi_conformance/abi.expected.json
 */

import { State, Logic, Init, Event } from '@calimero-network/calimero-sdk-js';
import { UnorderedMap, Vector } from '@calimero-network/calimero-sdk-js/collections';

// Type aliases
export type UserId32 = Uint8Array; // bytes[32]
export type Hash64 = Uint8Array; // bytes

// Record types
export interface Person {
  id: UserId32;
  name: string;
  age: number; // u32
}

export interface CustomRecord {
  name: string;
  value: bigint; // u64
  active: boolean;
}

export interface Profile {
  bio?: string | null;
  avatar?: Uint8Array | null;
  nicknames: string[];
}

export interface NestedRecord {
  record: CustomRecord;
  tags: string[];
}

export interface UpdatePayload {
  age: number; // u32
}

export interface InternalResult {
  original: number; // u32
  calculated: number; // u32
}

export interface Action_MultiTuple {
  field_0: number; // u32
  field_1: string;
}

export interface Action_MultiStruct {
  x: number; // u32
  y: string;
}

export interface Event_TupleEvent {
  field_0: number; // u32
  field_1: string;
}

export interface Event_StructEvent {
  id: number; // u32
  name: string;
}

export interface Status_Active {
  timestamp: bigint; // u64
}

export interface Status_Completed {
  result: string;
}

// Variant types - using classes to represent variants
// Note: TypeScript doesn't have native variants, so we use classes/interfaces
// The emitter will need to detect these patterns

// Action variant - represented as a class hierarchy
export abstract class Action {
  static Ping(): Action_Ping {
    return new Action_Ping();
  }
  static SetName(name: string): Action_SetName {
    return new Action_SetName(name);
  }
  static Update(payload: UpdatePayload): Action_Update {
    return new Action_Update(payload);
  }
  static MultiTuple(payload: Action_MultiTuple): Action_MultiTuple_Variant {
    return new Action_MultiTuple_Variant(payload);
  }
  static MultiStruct(payload: Action_MultiStruct): Action_MultiStruct_Variant {
    return new Action_MultiStruct_Variant(payload);
  }
}

export class Action_Ping extends Action {}
export class Action_SetName extends Action {
  constructor(public payload: string) {
    super();
  }
}
export class Action_Update extends Action {
  constructor(public payload: UpdatePayload) {
    super();
  }
}
export class Action_MultiTuple_Variant extends Action {
  constructor(public payload: Action_MultiTuple) {
    super();
  }
}
export class Action_MultiStruct_Variant extends Action {
  constructor(public payload: Action_MultiStruct) {
    super();
  }
}

// Status variant
export abstract class Status {
  static Pending(): Status_Pending {
    return new Status_Pending();
  }
  static Active(payload: Status_Active): Status_Active_Variant {
    return new Status_Active_Variant(payload);
  }
  static Completed(payload: Status_Completed): Status_Completed_Variant {
    return new Status_Completed_Variant(payload);
  }
}

export class Status_Pending extends Status {}
export class Status_Active_Variant extends Status {
  constructor(public payload: Status_Active) {
    super();
  }
}
export class Status_Completed_Variant extends Status {
  constructor(public payload: Status_Completed) {
    super();
  }
}

// ConformanceError variant
export abstract class ConformanceError {
  static BadInput(): ConformanceError_BadInput {
    return new ConformanceError_BadInput();
  }
  static NotFound(payload: string): ConformanceError_NotFound {
    return new ConformanceError_NotFound(payload);
  }
}

export class ConformanceError_BadInput extends ConformanceError {}
export class ConformanceError_NotFound extends ConformanceError {
  constructor(public payload: string) {
    super();
  }
}

// State class matching Rust AbiState
@State
export class AbiState {
  counters: UnorderedMap<string, number> = new UnorderedMap(); // map<string, u32>
  users: Vector<UserId32> = new Vector(); // list<UserId32>
}

// Logic class
@Logic(AbiState)
export class AbiLogic extends AbiState {
  @Init
  static init(): AbiState {
    return new AbiState();
  }

  // Echo methods for all scalar types
  noop(): void {}

  echo_bool(b: boolean): boolean {
    return b;
  }

  echo_i32(x: number): number {
    return x;
  }

  echo_i64(x: bigint): bigint {
    return x;
  }

  echo_u32(x: number): number {
    return x;
  }

  echo_u64(x: bigint): bigint {
    return x;
  }

  echo_f32(x: number): number {
    return x;
  }

  echo_f64(x: number): number {
    return x;
  }

  echo_string(s: string): string {
    return s;
  }

  echo_bytes(b: Uint8Array): Uint8Array {
    return b;
  }

  // Optional/nullable methods
  opt_u32(x?: number): number | undefined {
    return x;
  }

  opt_string(s?: string): string | undefined {
    return s;
  }

  opt_record(p?: Person): Person | undefined {
    return p;
  }

  opt_id(x?: UserId32): UserId32 | undefined {
    return x;
  }

  // List methods
  list_u32(xs: number[]): number[] {
    return xs;
  }

  list_strings(xs: string[]): string[] {
    return xs;
  }

  list_records(ps: Person[]): Person[] {
    return ps;
  }

  list_ids(xs: UserId32[]): UserId32[] {
    return xs;
  }

  // Map methods
  map_u32(m: Map<string, number>): Map<string, number> {
    return m;
  }

  map_list_u32(m: Map<string, number[]>): Map<string, number[]> {
    return m;
  }

  map_record(m: Map<string, Person>): Map<string, Person> {
    return m;
  }

  // Record methods
  make_person(p: Person): Person {
    return p;
  }

  profile_roundtrip(p: Profile): Profile {
    return p;
  }

  // Variant methods
  act(_a: Action): number {
    return 0;
  }

  handle_multi_tuple(_a: Action): string {
    return '';
  }

  handle_multi_struct(_a: Action): number {
    return 0;
  }

  // Alias methods
  roundtrip_id(x: UserId32): UserId32 {
    return x;
  }

  roundtrip_hash(h: Hash64): Hash64 {
    return h;
  }

  // Other methods
  may_fail(_flag: boolean): number {
    return 0;
  }

  find_person(_name: string): Person {
    return { id: new Uint8Array(32), name: '', age: 0 };
  }

  public_with_private_helper(value: number): number {
    return value;
  }

  private _private_helper(value: number): number {
    return value * 2;
  }

  get_internal_result(value: number): InternalResult {
    return { original: value, calculated: value * 2 };
  }

  create_custom_record(_name: string, value: bigint): CustomRecord {
    return { name: '', value, active: true };
  }

  get_nested_record(_name: string): NestedRecord {
    return {
      record: { name: '', value: BigInt(0), active: false },
      tags: [],
    };
  }

  get_status(_timestamp: bigint): Status {
    return Status.Pending();
  }
}

// Event classes
@Event
export class Ping {
  constructor() {}
}

@Event
export class Named {
  constructor(public payload: string) {}
}

@Event
export class Data {
  constructor(public payload: Uint8Array) {}
}

@Event
export class PersonUpdated {
  constructor(public payload: Person) {}
}

@Event
export class ActionTaken {
  constructor(public payload: Action) {}
}

@Event
export class TupleEvent {
  constructor(public payload: Event_TupleEvent) {}
}

@Event
export class StructEvent {
  constructor(public payload: Event_StructEvent) {}
}
