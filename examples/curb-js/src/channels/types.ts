import type { LwwRegister, UnorderedMap, UnorderedSet, Vector } from '@calimero/sdk/collections';

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
  moderators: UnorderedMap<UserId, string>;
  members: UnorderedMap<UserId, string>;
  linksAllowed: boolean;
}

export interface Attachment {
  name: string;
  mimeType: string;
  size: bigint;
  blobId: Uint8Array;
  uploadedAt: bigint;
}

export interface Message {
  timestamp: LwwRegister<bigint>;
  sender: UserId;
  senderUsername: LwwRegister<string>;
  mentions: UnorderedSet<UserId>;
  mentionsUsernames: Vector<LwwRegister<string>>;
  files: Vector<Attachment>;
  images: Vector<Attachment>;
  id: LwwRegister<string>;
  text: LwwRegister<string>;
  editedOn: LwwRegister<bigint> | null;
  deleted: LwwRegister<boolean> | null;
  group: LwwRegister<string>;
}

export interface ChannelInfo {
  messages: Vector<Message>;
  metadata: ChannelMetadata;
  type: ChannelType;
}

export interface ChannelMembershipEntry {
  publicKey: UserId;
  username: string | null;
}

export interface ChannelMetadataResponse {
  createdAt: bigint;
  createdBy: UserId;
  createdByUsername: string;
  readOnly: boolean;
  linksAllowed: boolean;
  moderators: ChannelMembershipEntry[];
  members: ChannelMembershipEntry[];
}

export interface ChannelInfoResponse {
  metadata: ChannelMetadataResponse;
  type: ChannelType;
}

export interface ChannelDefaultInit {
  name: ChannelId;
}

export interface ChannelCreationOptions {
  type?: ChannelType;
  readOnly?: boolean;
}
