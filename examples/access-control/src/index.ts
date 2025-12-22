import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import * as env from '@calimero-network/calimero-sdk-js/env';
import bs58 from 'bs58';

const textEncoder = new TextEncoder();

function encodeBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

function decodeBase58(input: string, expectedLength: number): Uint8Array {
  const decoded = bs58.decode(input);
  if (decoded.length !== expectedLength) {
    throw new Error(`Value must decode to exactly ${expectedLength} bytes`);
  }
  return decoded;
}

function publicKeyFromString(value: string): Uint8Array {
  return decodeBase58(value, 32);
}

function applicationIdFromString(value: string): Uint8Array {
  return decodeBase58(value, 32);
}

@State
export class AccessControl {}

@Logic(AccessControl)
export class AccessControlLogic extends AccessControl {
  @Init
  static init(): AccessControl {
    env.log('Initializing AccessControl app');
    return new AccessControl();
  }

  /**
   * Adds a member to the current context.
   * @param publicKeyBase58 - Base58-encoded 32-byte Ed25519 public key
   */
  addMember(publicKeyBase58: string): void {
    env.log(`Adding member: ${publicKeyBase58}`);
    const publicKey = publicKeyFromString(publicKeyBase58);
    env.contextAddMember(publicKey);
  }

  /**
   * Removes a member from the current context.
   * @param publicKeyBase58 - Base58-encoded 32-byte Ed25519 public key
   */
  kickMember(publicKeyBase58: string): void {
    env.log(`Kicking member: ${publicKeyBase58}`);
    const publicKey = publicKeyFromString(publicKeyBase58);
    env.contextRemoveMember(publicKey);
  }

  /**
   * Checks if a public key is a member of the current context.
   * @param publicKeyBase58 - Base58-encoded 32-byte Ed25519 public key
   * @returns true if the public key is a member, false otherwise
   */
  @View()
  isMember(publicKeyBase58: string): boolean {
    env.log(`Checking membership for: ${publicKeyBase58}`);
    const publicKey = publicKeyFromString(publicKeyBase58);
    return env.contextIsMember(publicKey);
  }

  /**
   * Gets all members of the current context.
   * @returns Array of Base58-encoded public keys
   */
  @View()
  getAllMembers(): string[] {
    env.log('Listing all members');
    const members = env.contextMembers();
    return members.map((key: Uint8Array) => encodeBase58(key));
  }

  /**
   * Creates a new child context with the specified application ID and alias.
   * @param protocol - Protocol identifier (e.g., "near", "icp", "ethereum")
   * @param applicationIdBase58 - Base58-encoded 32-byte application ID
   * @param alias - Alias string for the new context (max 64 bytes)
   */
  createContextChild(protocol: string, applicationIdBase58: string, alias: string): void {
    env.log(
      `Creating child context for protocol: ${protocol}, app: ${applicationIdBase58} with alias: ${alias}`
    );

    // Check if alias already exists to fail fast
    const aliasBytes = textEncoder.encode(alias);
    const existingId = env.contextResolveAlias(aliasBytes);
    if (existingId !== null) {
      throw new Error(`Alias '${alias}' already exists`);
    }

    // Decode App ID from Base58
    const appIdBytes = applicationIdFromString(applicationIdBase58);

    // Default initialization arguments (empty JSON object)
    const initArgs = textEncoder.encode('{}');

    // Create the context
    const protocolBytes = textEncoder.encode(protocol);
    env.contextCreate(protocolBytes, appIdBytes, initArgs, aliasBytes);
  }

  /**
   * Helper to get the ID of a child context by its alias.
   * @param alias - Alias string to resolve
   * @returns Base58-encoded context ID if alias exists, null otherwise
   */
  @View()
  getChildId(alias: string): string | null {
    const aliasBytes = textEncoder.encode(alias);
    const id = env.contextResolveAlias(aliasBytes);
    if (id === null) {
      return null;
    }
    return encodeBase58(id);
  }

  /**
   * Deletes a context.
   * @param contextIdBase58 - The ID of the context to delete (Base58).
   *                          If empty, deletes the current context (self-destruct).
   */
  deleteContextChild(contextIdBase58: string): void {
    if (contextIdBase58 === '') {
      env.log('Deleting current context (self-destruct)');
      const currentContextId = env.contextId();
      env.contextDelete(currentContextId);
      return;
    }

    env.log(`Deleting context: ${contextIdBase58}`);
    const contextIdToDelete = decodeBase58(contextIdBase58, 32);
    env.contextDelete(contextIdToDelete);
  }
}
