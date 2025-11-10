import type { UnorderedMap } from '@calimero/sdk/collections';

import type { ChannelInfo } from './channels/types';

export type UserId = string;
export type ChannelId = string;

export interface ChatState {
  owner: UserId;
  createdAt: bigint;
  members: UnorderedMap<UserId, string>;
  channels: UnorderedMap<ChannelId, ChannelInfo>;
  isDMchat: boolean;
}

export interface ChatMemberAccess {
  ensureMemberExists(userId: UserId, username?: string): string | null;
  getExecutorId(): UserId;
  getUsername(userId: UserId): string | null;
}


