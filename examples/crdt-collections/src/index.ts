import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import {
  PNCounter,
  Rga,
  SortedMap,
  SortedSet,
} from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

/**
 * Phase 1 CRDT-type expansion demo.
 *
 * Exercises the four new JS Service SDK collection wrappers that wrap the core
 * host functions landed in calimero-network/core#3318:
 *
 *  - PNCounter  — signed counter (increment + decrement)
 *  - Rga        — replicated growable array (collaborative text)
 *  - SortedMap  — map with deterministic (sorted) iteration
 *  - SortedSet  — set with deterministic (sorted) iteration
 */
@State
export class CrdtDemo {
  // Signed counter: increments minus decrements.
  score: PNCounter = new PNCounter();
  // Collaborative text buffer.
  doc: Rga = new Rga();
  // name -> points, iterated in sorted key order.
  leaderboard: SortedMap<string, number> = new SortedMap<string, number>();
  // tags, iterated in sorted order.
  tags: SortedSet<string> = new SortedSet<string>();
}

@Logic(CrdtDemo)
export class CrdtDemoLogic extends CrdtDemo {
  @Init
  static init(): CrdtDemo {
    env.log('Initializing CrdtDemo');
    return new CrdtDemo();
  }

  // --- PNCounter ----------------------------------------------------------

  addPoint(): void {
    this.score.increment();
  }

  removePoint(): void {
    this.score.decrement();
  }

  @View()
  getScore(): bigint {
    return this.score.value();
  }

  // --- Rga (text) ---------------------------------------------------------

  insertText(index: number, text: string): void {
    this.doc.insert(index, text);
  }

  deleteChar(index: number): void {
    this.doc.delete(index);
  }

  @View()
  getText(): string {
    return this.doc.getText();
  }

  @View()
  getTextLen(): number {
    return this.doc.len();
  }

  // --- SortedMap ----------------------------------------------------------

  setPoints(name: string, points: number): void {
    this.leaderboard.set(name, points);
  }

  @View()
  getPoints(name: string): number {
    return this.leaderboard.get(name) ?? 0;
  }

  @View()
  rankedNames(): string[] {
    // Sorted key order thanks to SortedMap.
    return this.leaderboard.keys();
  }

  // --- SortedSet ----------------------------------------------------------

  addTag(tag: string): void {
    this.tags.add(tag);
  }

  @View()
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  @View()
  allTags(): string[] {
    // Sorted order thanks to SortedSet.
    return this.tags.toArray();
  }
}
