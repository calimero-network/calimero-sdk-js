import type { ChannelId, UserId, Username } from '../types';
import type { StoredMessage } from '../messageManagement/types';
import { LwwRegister, UnorderedMap, UnorderedSet, Vector } from '@calimero/sdk/collections';

export enum ChannelType {
  Default = 'default',
  Private = 'private',
  Public = 'public',
}

export type ChannelMetadata = {
  type: ChannelType;
  createdAt: bigint;
  createdBy: UserId;
  createdByUsername: Username;
  readOnly: boolean;
  channelMembers: LwwRegister<UnorderedSet<UserId>>;
  channelModerators: LwwRegister<UnorderedSet<UserId>>;
  channelMessages: LwwRegister<Vector<StoredMessage>>;
  threadMessages: UnorderedMap<string, LwwRegister<Vector<StoredMessage>>>;
  messageReactions: UnorderedMap<string, UnorderedMap<string, UnorderedSet<UserId>>>;
};

export type ChannelMembershipEntry = {
  publicKey: UserId;
  username: Username;
};

export type ChannelMetadataResponse = {
  channelId: ChannelId;
  type: ChannelType;
  createdAt: string;
  createdBy: UserId;
  createdByUsername: Username;
  readOnly: boolean;
  moderators: ChannelMembershipEntry[];
  members: ChannelMembershipEntry[];
  unreadMessages: {
    count: number;
    mentions: number;
  };
};

export type ChannelDirectoryResponse = {
  joined: ChannelMetadataResponse[];
  availablePublic: ChannelMetadataResponse[];
};

export type CreateChannelInput = {
  name: ChannelId;
  type?: ChannelType;
  readOnly?: boolean;
};

export type ChannelMembershipInput = {
  channelId: ChannelId;
  userId: UserId;
  username?: Username;
};

export type ModeratorInput = {
  channelId: ChannelId;
  userId: UserId;
};
