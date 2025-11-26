import type { ChannelId, UserId, Username } from '../types';

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
