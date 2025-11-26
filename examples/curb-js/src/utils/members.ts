import type { UnorderedMap } from '@calimero/sdk/collections';

import type { UserId, Username } from '../types';

export function isUsernameTaken(
  members: UnorderedMap<UserId, Username>,
  username: Username
): boolean {
  const normalized = username.trim().toLowerCase();
  return members.entries().some(([, existing]) => existing.toLowerCase() === normalized);
}
