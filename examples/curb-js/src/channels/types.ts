import type { UnorderedSet, Vector } from '@calimero/sdk/collections';

import type { ChannelId, UserId } from '../types';

export enum ChannelType {
  Default = 'default',
  Private = 'private',
  Public = 'public'
}

export interface ChannelMetadata {
  createdAt: bigint;
  createdBy: UserId;
  createdByUsername: string;
  readOnly: boolean;
  moderators: UnorderedSet<UserId>;
  members: UnorderedSet<UserId>;
  linksAllowed: boolean;
}

export interface ChannelInfo {
  messages: Vector<string>;
  metadata: ChannelMetadata;
  type: ChannelType;
}

export interface ChannelDefaultInit {
  name: ChannelId;
}

export interface ChannelCreationOptions {
  type?: ChannelType;
  readOnly?: boolean;
}
