/**
 * E2E CRDT Test App
 *
 * Test application that exercises the core CRDTs in the JS SDK:
 * - GCounter: Grow-only counter
 * - PNCounter: Positive-negative counter (supports decrement)
 * - UnorderedMap: Key-value map with LWW semantics for entries
 * - UnorderedSet: Set with add/remove support
 * - Vector: Ordered list
 *
 * This tests sync and merge behavior across 3 nodes.
 */

import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import {
  GCounter,
  PNCounter,
  UnorderedMap,
  UnorderedSet,
  Vector,
} from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

// ============================================================================
// State Definition
// ============================================================================

@State
export class E2eCrdtTestState {
  // --- GCounter: Grow-only counters ---
  gCounters: UnorderedMap<string, GCounter> = new UnorderedMap();

  // --- PNCounter: Positive-negative counters ---
  pnCounters: UnorderedMap<string, PNCounter> = new UnorderedMap();

  // --- Simple key-value storage (map entries use LWW semantics internally) ---
  registers: UnorderedMap<string, string> = new UnorderedMap();

  // --- UnorderedSet: Tag sets per category ---
  tagSets: UnorderedMap<string, UnorderedSet<string>> = new UnorderedMap();

  // --- Vector: Metric history ---
  metrics: Vector<GCounter> = new Vector();

  // --- Handler execution counter ---
  handlerCounter: GCounter = new GCounter();
}

// ============================================================================
// Logic Implementation
// ============================================================================

@Logic(E2eCrdtTestState)
export class E2eCrdtTestLogic extends E2eCrdtTestState {
  @Init
  static init(): E2eCrdtTestState {
    env.log('Initializing E2E CRDT Test App');
    return new E2eCrdtTestState();
  }

  // ==========================================================================
  // GCounter Operations
  // ==========================================================================

  incrementGCounter(key: string): bigint {
    env.log(`Incrementing GCounter: ${key}`);
    let counter = this.gCounters.get(key);
    if (!counter) {
      counter = new GCounter();
      this.gCounters.set(key, counter);
    }
    counter.increment();
    const value = counter.value();
    return value;
  }

  incrementGCounterBy(key: string, amount: bigint): bigint {
    env.log(`Incrementing GCounter ${key} by ${amount}`);
    let counter = this.gCounters.get(key);
    if (!counter) {
      counter = new GCounter();
      this.gCounters.set(key, counter);
    }
    counter.incrementBy(amount);
    const value = counter.value();
    return value;
  }

  @View()
  getGCounter(key: string): bigint {
    const counter = this.gCounters.get(key);
    return counter ? counter.value() : 0n;
  }

  // ==========================================================================
  // PNCounter Operations
  // ==========================================================================

  incrementPNCounter(key: string): bigint {
    env.log(`Incrementing PNCounter: ${key}`);
    let counter = this.pnCounters.get(key);
    if (!counter) {
      counter = new PNCounter();
      this.pnCounters.set(key, counter);
    }
    counter.increment();
    const value = counter.value();
    return value;
  }

  decrementPNCounter(key: string): bigint {
    env.log(`Decrementing PNCounter: ${key}`);
    let counter = this.pnCounters.get(key);
    if (!counter) {
      counter = new PNCounter();
      this.pnCounters.set(key, counter);
    }
    counter.decrement();
    const value = counter.value();
    return value;
  }

  @View()
  getPNCounter(key: string): bigint {
    const counter = this.pnCounters.get(key);
    return counter ? counter.value() : 0n;
  }

  // ==========================================================================
  // Register Operations (using map entries with LWW semantics)
  // ==========================================================================

  setRegister(key: string, value: string): void {
    env.log(`Setting register ${key} = ${value}`);
    // Map entries use LWW semantics internally - just set directly
    this.registers.set(key, value);
  }

  @View()
  getRegister(key: string): string | null {
    // Map entries use LWW semantics - get returns the value directly
    return this.registers.get(key);
  }

  // ==========================================================================
  // UnorderedMap Operations (KV Store)
  // ==========================================================================

  set(key: string, value: string): void {
    env.log(`Setting KV: ${key} = ${value}`);
    // Map entries use LWW semantics internally
    this.registers.set(key, value);
  }

  @View()
  get(key: string): string | null {
    return this.registers.get(key);
  }

  @View()
  entries(): Array<[string, string]> {
    // Map entries() returns the values directly
    return this.registers.entries();
  }

  @View()
  len(): number {
    return this.registers.entries().length;
  }

  // ==========================================================================
  // UnorderedSet Operations (Tags)
  // ==========================================================================

  addTag(category: string, tag: string): boolean {
    env.log(`Adding tag ${tag} to category ${category}`);
    let tags = this.tagSets.get(category);
    if (!tags) {
      tags = new UnorderedSet<string>();
      this.tagSets.set(category, tags);
    }
    const added = tags.add(tag);
    return added;
  }

  removeTag(category: string, tag: string): boolean {
    env.log(`Removing tag ${tag} from category ${category}`);
    const tags = this.tagSets.get(category);
    if (!tags) {
      return false;
    }
    return tags.delete(tag);
  }

  @View()
  hasTag(category: string, tag: string): boolean {
    const tags = this.tagSets.get(category);
    return tags ? tags.has(tag) : false;
  }

  @View()
  getTags(category: string): string[] {
    const tags = this.tagSets.get(category);
    return tags ? tags.toArray() : [];
  }

  @View()
  getTagCount(category: string): number {
    const tags = this.tagSets.get(category);
    return tags ? tags.size() : 0;
  }

  // ==========================================================================
  // Vector Operations (Metrics)
  // ==========================================================================

  pushMetric(): bigint {
    env.log('Pushing new metric');
    const counter = new GCounter();
    counter.increment();
    this.metrics.push(counter);
    const value = counter.value();
    return value;
  }

  incrementMetric(index: number): bigint {
    env.log(`Incrementing metric at index ${index}`);
    const counter = this.metrics.get(index);
    if (!counter) {
      throw new Error(`Metric at index ${index} not found`);
    }
    counter.increment();
    const value = counter.value();
    return value;
  }

  @View()
  getMetric(index: number): bigint {
    const counter = this.metrics.get(index);
    return counter ? counter.value() : 0n;
  }

  @View()
  metricsLen(): number {
    return this.metrics.len();
  }

  // ==========================================================================
  // Handler Counter (for testing event handlers)
  // ==========================================================================

  incrementHandler(): bigint {
    env.log('Incrementing handler counter');
    this.handlerCounter.increment();
    return this.handlerCounter.value();
  }

  @View()
  getHandlerCount(): bigint {
    return this.handlerCounter.value();
  }

  // ==========================================================================
  // Context Members (testing context API)
  // ==========================================================================

  @View()
  getContextMembers(): Uint8Array[] {
    return env.contextMembers();
  }

  @View()
  isMember(publicKey: Uint8Array): boolean {
    return env.contextIsMember(publicKey);
  }
}
