import type { ChatState, UserId } from '../types';

const USERNAME_MAX_LENGTH = 50;

export function normalizeUsername(value: string): string {
  return value.trim();
}

export function validateUsername(normalized: string): string | null {
  if (!normalized) {
    return 'Username cannot be empty';
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return `Username cannot be longer than ${USERNAME_MAX_LENGTH} characters`;
  }

  return null;
}

export function isUsernameAvailable(state: ChatState, username: string): boolean {
  return state.isDMchat || !state.members.values().some(existing => existing === username);
}

export function ensureMemberRegistered(
  state: ChatState,
  userId: UserId,
  username: string | undefined
): string | null {
  if (state.members.has(userId)) {
    return null;
  }

  if (!username) {
    return 'Username required to add a new member';
  }

  const normalized = normalizeUsername(username);
  const validationError = validateUsername(normalized);
  if (validationError) {
    return validationError;
  }

  if (!isUsernameAvailable(state, normalized)) {
    return 'Username is already taken';
  }

  state.members.set(userId, normalized);
  return null;
}
