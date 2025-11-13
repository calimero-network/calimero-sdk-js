import { UnorderedMap, Vector } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

import type { ChatMemberAccess, ChatState, ChannelId, UserId } from '../types';
import {
  ChannelInfoResponse,
  ChannelType,
  type ChannelCreationOptions,
  type ChannelDefaultInit,
  type ChannelInfo,
  type Message
} from './types';

const CHANNEL_NAME_MAX_LENGTH = 64;

export class ChannelsHandler {
  constructor(
    private readonly state: ChatState,
    private readonly membersAccess: ChatMemberAccess
  ) {}

  bootstrapDefaultChannels(defaultChannels: ChannelDefaultInit[], ownerUsername: string): void {
    const storedOwnerUsername =
      this.membersAccess.getUsername(this.state.owner) ?? ownerUsername.trim();

    defaultChannels.forEach(({ name }) => {
      const normalizedId = this.normalizeChannelId(name);
      const validationError = this.validateChannelId(normalizedId);

      if (validationError || this.state.channels.has(normalizedId)) {
        return;
      }

      const channelInfo = this.createChannelInfo({
        creatorId: this.state.owner,
        creatorUsername: storedOwnerUsername,
        type: ChannelType.Default,
        readOnly: false,
        members: [{ userId: this.state.owner, username: storedOwnerUsername }],
        moderators: [{ userId: this.state.owner, username: storedOwnerUsername }],
        createdAt: this.state.createdAt
      });

      this.persistChannel(normalizedId, channelInfo);
    });
  }

  getChannel(channelId: ChannelId): ChannelInfo | null {
    return this.state.channels.get(channelId) ?? null;
  }

  getChannelsForUser(userId: UserId): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    const entries = this.state.channels.entries().filter(([, info]) =>
      info.metadata.members.has(userId)
    );
    return this.mapChannels(entries);
  }

  getDefaultAndPublicChannels(): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    const entries = this.state.channels
      .entries()
      .filter(([, info]) => info.type === ChannelType.Default || info.type === ChannelType.Public);
    return this.mapChannels(entries);
  }

  createChannel(channelId: ChannelId, options: ChannelCreationOptions = {}): ChannelInfoResponse | string {
    const normalizedId = this.normalizeChannelId(channelId);
    const validationError = this.validateChannelId(normalizedId);
    if (validationError) {
      return validationError;
    }

    if (this.state.channels.has(normalizedId)) {
      return 'Channel already exists';
    }

    const creatorId = this.membersAccess.getExecutorId();
    const creatorUsername = this.membersAccess.getUsername(creatorId);
    if (!creatorUsername) {
      return 'Creator must be a member of the chat';
    }

    const channelType = options.type ?? ChannelType.Public;
    if (channelType === ChannelType.Default) {
      return 'Default channels can only be created during initialization';
    }

    const channelInfo = this.createChannelInfo({
      creatorId,
      creatorUsername,
      type: channelType,
      readOnly: options.readOnly ?? false,
      members: [{ userId: creatorId, username: creatorUsername }],
      moderators: [{ userId: creatorId, username: creatorUsername }]
    });

    this.persistChannel(normalizedId, channelInfo);
    return this.toResponse(channelInfo);
  }

  deleteChannel(channelId: ChannelId): string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    if (channel.type === ChannelType.Default) {
      return 'Default channels cannot be deleted';
    }

    this.state.channels.remove(channelId);
    return 'Channel deleted';
  }

  addChannelModerator(channelId: ChannelId, userId: UserId): ChannelInfoResponse | string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.membersAccess.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can promote other users';
    }

    if (!channel.metadata.members.has(userId)) {
      return 'User must be a member of the channel';
    }

    if (channel.metadata.moderators.has(userId)) {
      return 'User is already a moderator';
    }

    const username = this.membersAccess.getUsername(userId);
    if (!username) {
      return 'User must have a registered username';
    }

    channel.metadata.moderators.set(userId, username);
    this.persistChannel(channelId, channel);
    return this.toResponse(channel);
  }

  removeChannelModerator(channelId: ChannelId, userId: UserId): ChannelInfoResponse | string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId =  this.membersAccess.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can demote moderators';
    }

    if (!channel.metadata.moderators.has(userId)) {
      return 'User is not a moderator';
    }

    channel.metadata.moderators.remove(userId);
    this.persistChannel(channelId, channel);
    return this.toResponse(channel);
  }

  addMemberToChannel(channelId: ChannelId, userId: UserId, username?: string): ChannelInfoResponse | string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.membersAccess.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can add members to the channel';
    }

    if (channel.metadata.members.has(userId)) {
      return 'User is already a member of this channel';
    }

    const wasMember = this.state.members.has(userId);
    const ensureError = this.membersAccess.ensureMemberExists(userId, username);
    if (ensureError) {
      return ensureError;
    }

    if (!wasMember) {
      this.addUserToDefaultChannels(userId);
    }

    const usernameToSet = this.state.members.get(userId);
    if (!usernameToSet) {
      return 'Failed to resolve member username';
    }

    channel.metadata.members.set(userId, usernameToSet);
    this.persistChannel(channelId, channel);
    return this.toResponse(channel);
  }

  removeMemberFromChannel(channelId: ChannelId, userId: UserId): ChannelInfoResponse | string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.membersAccess.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can remove members from the channel';
    }

    if (!channel.metadata.members.has(userId)) {
      return 'User is not a member of this channel';
    }

    if (channel.metadata.moderators.has(userId)) {
      channel.metadata.moderators.remove(userId);
    }

    channel.metadata.members.remove(userId);
    this.persistChannel(channelId, channel);
    return this.toResponse(channel);
  }

  private createChannelInfo(params: {
    creatorId: UserId;
    creatorUsername: string;
    type: ChannelType;
    readOnly: boolean;
    members: Array<{ userId: UserId; username: string }>;
    moderators: Array<{ userId: UserId; username: string }>;
    createdAt?: bigint;
  }): ChannelInfo {
    const moderators = new UnorderedMap<UserId, string>();
    params.moderators.forEach(({ userId, username }) => moderators.set(userId, username));

    const members = new UnorderedMap<UserId, string>();
    params.members.forEach(({ userId, username }) => members.set(userId, username));

    return {
      messages: new Vector<Message>(),
      metadata: {
        createdAt: params.createdAt ?? env.timeNow(),
        createdBy: params.creatorId,
        createdByUsername: params.creatorUsername,
        readOnly: params.readOnly,
        moderators,
        members,
        linksAllowed: true
      },
      type: params.type
    };
  }

  private mapChannels(entries: Array<[ChannelId, ChannelInfo]>): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    return entries.map(([channelId, info]) => ({ channelId, info }));
  }

  private persistChannel(channelId: ChannelId, channel: ChannelInfo): void {
    this.state.channels.set(channelId, channel);
  }

  private normalizeChannelId(channelId: string): string {
    return channelId.trim();
  }

  private validateChannelId(normalized: string): string | null {
    if (!normalized) {
      return 'Channel name cannot be empty';
    }

    if (normalized.length > CHANNEL_NAME_MAX_LENGTH) {
      return `Channel name cannot be longer than ${CHANNEL_NAME_MAX_LENGTH} characters`;
    }

    return null;
  }

  private addUserToDefaultChannels(userId: UserId): void {
    this.state.channels.entries().forEach(([defaultChannelId, info]) => {
      if (info.type !== ChannelType.Default) {
        return;
      }

      if (!info.metadata.members.has(userId)) {
        const username = this.state.members.get(userId);
        if (!username) {
          return;
        }
        info.metadata.members.set(userId, username);
        this.persistChannel(defaultChannelId, info);
      }
    });
  }

  private toResponse(info: ChannelInfo): ChannelInfoResponse {
    return {
      type: info.type,
      metadata: {
        createdAt: info.metadata.createdAt,
        createdBy: info.metadata.createdBy,
        createdByUsername: info.metadata.createdByUsername,
        readOnly: info.metadata.readOnly,
        linksAllowed: info.metadata.linksAllowed,
        moderators: info.metadata.moderators.entries().map(([userId, username]) => ({
          publicKey: userId,
          username
        })),
        members: info.metadata.members.entries().map(([userId, username]) => ({
          publicKey: userId,
          username
        }))
      }
    };
  }
}
