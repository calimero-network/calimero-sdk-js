import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import { AuthoredMap, AuthoredVector } from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

/**
 * Phase 2a attributed CRDT-type expansion demo.
 *
 * Exercises the two new JS Service SDK attributed collection wrappers that wrap
 * the core host functions landed in calimero-network/core#3321:
 *
 *  - AuthoredMap    — map whose entries are stamped with an owner; `update`
 *                     and `remove` are owner-only.
 *  - AuthoredVector — ordered list whose slots are stamped with an owner;
 *                     `update` and `tombstone` are owner-only.
 *
 * `insert`/`push` stamp the calling executor as the owner automatically.
 */
@State
export class AuthoredDemo {
  // name -> profile note, each entry owned by whoever inserted it.
  profiles: AuthoredMap<string, string> = new AuthoredMap<string, string>();
  // append-only feed of posts, each slot owned by its author.
  posts: AuthoredVector<string> = new AuthoredVector<string>();
}

@Logic(AuthoredDemo)
export class AuthoredDemoLogic extends AuthoredDemo {
  @Init
  static init(): AuthoredDemo {
    env.log('Initializing AuthoredDemo');
    return new AuthoredDemo();
  }

  // --- AuthoredMap --------------------------------------------------------

  // Insert stamps the caller as the entry owner (fails if the key exists).
  setProfile(name: string, note: string): void {
    this.profiles.insert(name, note);
  }

  // Owner-only: throws if the caller does not own the entry.
  updateProfile(name: string, note: string): void {
    this.profiles.update(name, note);
  }

  @View()
  getProfile(name: string): string {
    return this.profiles.get(name) ?? '';
  }

  @View()
  profileOwnedByMe(name: string): boolean {
    return this.profiles.ownedByMe(name);
  }

  @View()
  profileNames(): string[] {
    return this.profiles.keys();
  }

  // --- AuthoredVector -----------------------------------------------------

  // Push stamps the caller as the slot owner and returns the new index.
  addPost(text: string): number {
    return this.posts.push(text);
  }

  // Owner-only: throws if the caller does not own the slot.
  editPost(index: number, text: string): void {
    this.posts.update(index, text);
  }

  // Owner-only: throws if the caller does not own the slot.
  deletePost(index: number): void {
    this.posts.tombstone(index);
  }

  @View()
  getPost(index: number): string {
    return this.posts.get(index) ?? '';
  }

  @View()
  postOwnedByMe(index: number): boolean {
    return this.posts.ownedByMe(index);
  }

  @View()
  allPosts(): string[] {
    return this.posts.toArray();
  }

  @View()
  postCount(): number {
    return this.posts.len();
  }
}
