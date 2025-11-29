/**
 * State Schema Conformance Test Example
 *
 * This file is used to test state schema generation and verify it matches expected output.
 * It should generate the same state schema as the Rust version:
 * https://github.com/calimero-network/core/blob/master/apps/state-schema-conformance/state-schema.expected.json
 *
 * The state schema contains only state_root and types (not methods/events).
 */

import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
import {
  UnorderedMap,
  UnorderedSet,
  Vector,
  Counter,
  LwwRegister,
} from '@calimero-network/calimero-sdk-js/collections';

// Newtype bytes - Uint8Array with size 32
export type UserId32 = Uint8Array; // bytes[32]

// Record types
export interface Person {
  id: UserId32;
  name: string;
  age: number; // u32
}

// Profile with CRDT fields (can be used directly in UnorderedMap)
export class Profile {
  bio: LwwRegister<string | null> = new LwwRegister<string | null>();
  visit_count: Counter = new Counter();
}

// Variant types - using classes to represent variants
export abstract class Status {
  static Active(timestamp: bigint): Status_Active {
    return new Status_Active(timestamp);
  }
  static Inactive(): Status_Inactive {
    return new Status_Inactive();
  }
  static Pending(reason: string): Status_Pending {
    return new Status_Pending(reason);
  }
}

export class Status_Active extends Status {
  constructor(public timestamp: bigint) {
    super();
  }
}

export class Status_Inactive extends Status {}

export class Status_Pending extends Status {
  constructor(public reason: string) {
    super();
  }
}

// State with comprehensive Calimero collection types
@State
export class StateSchemaConformance {
  // Maps with various value types (all using UnorderedMap with LwwRegister values)
  string_map: UnorderedMap<string, LwwRegister<string>> = new UnorderedMap(); // map<string, string>
  int_map: UnorderedMap<string, LwwRegister<number>> = new UnorderedMap(); // map<string, u32>
  record_map: UnorderedMap<string, LwwRegister<Person>> = new UnorderedMap(); // map<string, Person>
  nested_map: UnorderedMap<string, UnorderedMap<string, LwwRegister<number>>> = new UnorderedMap(); // map<string, map<string, u32>>

  // Lists using Vector (Calimero collection) - Vector items must be CRDTs
  counter_list: Vector<Counter> = new Vector(); // list<Counter>
  register_list: Vector<LwwRegister<string>> = new Vector(); // list<LwwRegister<string>>
  record_list: Vector<LwwRegister<Person>> = new Vector(); // list<Person> (wrapped for CRDT)
  nested_list: Vector<Vector<Counter>> = new Vector(); // list<list<Counter>>

  // Nested collections
  map_of_counters: UnorderedMap<string, Counter> = new UnorderedMap(); // map<string, Counter>
  map_of_lists: UnorderedMap<string, Vector<Counter>> = new UnorderedMap(); // map<string, list<Counter>>
  list_of_maps: Vector<UnorderedMap<string, LwwRegister<number>>> = new Vector(); // list<map<string, u32>>

  // Sets
  string_set: UnorderedSet<string> = new UnorderedSet(); // set<string>

  // Counters
  visit_counter: Counter = new Counter(); // counter

  // Records with collections (Profile has CRDT fields)
  profile_map: UnorderedMap<string, Profile> = new UnorderedMap(); // map<string, Profile>

  // Variants wrapped in LwwRegister (for CRDT semantics)
  status: LwwRegister<Status> = new LwwRegister<Status>(); // Variant enum

  // Newtype bytes wrapped in LwwRegister
  user_id: LwwRegister<UserId32> = new LwwRegister<UserId32>(); // Newtype [u8; 32]

  // Scalar types wrapped in LwwRegister (required for CRDT semantics)
  counter: LwwRegister<bigint> = new LwwRegister<bigint>();
  name: LwwRegister<string> = new LwwRegister<string>();
  active: LwwRegister<boolean> = new LwwRegister<boolean>();
}

@Logic(StateSchemaConformance)
export class StateSchemaConformanceLogic extends StateSchemaConformance {
  @Init
  static init(): StateSchemaConformance {
    return new StateSchemaConformance();
  }
}
