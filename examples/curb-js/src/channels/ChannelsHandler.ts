import { UnorderedSet, Vector } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

import type { ChatMemberAccess, ChatState, ChannelId, UserId } from '../types';
import {
  ChannelType,
  type ChannelCreationOptions,
  type ChannelDefaultInit,
  type ChannelInfo
} from './types';

const CHANNEL_NAME_MAX_LENGTH = 64;

export class ChannelsHandler {
  constructor(private readonly state: ChatState, private readonly chat: ChatMemberAccess) {}

  bootstrapDefaultChannels(defaultChannels: ChannelDefaultInit[], ownerUsername: string): void {
    const storedOwnerUsername = this.chat.getUsername(this.state.owner) ?? ownerUsername.trim();

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
        members: [this.state.owner],
        moderators: [this.state.owner],
        createdAt: this.state.createdAt
      });

      this.persistChannel(normalizedId, channelInfo);
    });
  }

  getChannel(channelId: ChannelId): ChannelInfo | null {
    return this.state.channels.get(channelId) ?? null;
  }

  getChannelsForUser(userId: UserId): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    const entries = this.state.channels.entries().filter(([, info]) => info.metadata.members.has(userId));
    return this.mapChannels(entries);
  }

  getDefaultAndPublicChannels(): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    const entries = this.state.channels
      .entries()
      .filter(([, info]) => info.type === ChannelType.Default || info.type === ChannelType.Public);
    return this.mapChannels(entries);
  }

  createChannel(channelId: ChannelId, options: ChannelCreationOptions = {}): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const validationError = this.validateChannelId(normalizedId);
    if (validationError) {
      return validationError;
    }

    if (this.state.channels.has(normalizedId)) {
      return 'Channel already exists';
    }

    const creatorId = this.chat.getExecutorId();
    const creatorUsername = this.chat.getUsername(creatorId);
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
      members: [creatorId],
      moderators: [creatorId]
    });

    this.persistChannel(normalizedId, channelInfo);
    return 'Channel created';
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

  addChannelModerator(channelId: ChannelId, userId: UserId): string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.chat.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can promote other users';
    }

    if (!channel.metadata.members.has(userId)) {
      return 'User must be a member of the channel';
    }

    if (channel.metadata.moderators.has(userId)) {
      return 'User is already a moderator';
    }

    channel.metadata.moderators.add(userId);
    this.persistChannel(channelId, channel);
    return 'User promoted to moderator';
  }

  removeChannelModerator(channelId: ChannelId, userId: UserId): string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.chat.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can demote moderators';
    }

    if (!channel.metadata.moderators.has(userId)) {
      return 'User is not a moderator';
    }

    channel.metadata.moderators.delete(userId);
    this.persistChannel(channelId, channel);
    return 'Moderator removed';
  }

  addMemberToChannel(channelId: ChannelId, userId: UserId, username?: string): string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.chat.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can add members to the channel';
    }

    if (channel.metadata.members.has(userId)) {
      return 'User is already a member of this channel';
    }

    const wasMember = this.state.members.has(userId);
    const ensureError = this.chat.ensureMemberExists(userId, username);
    if (ensureError) {
      return ensureError;
    }

    if (!wasMember) {
      this.addUserToDefaultChannels(userId);
    }

    channel.metadata.members.add(userId);
    this.persistChannel(channelId, channel);
    return 'Member added to channel';
  }

  removeMemberFromChannel(channelId: ChannelId, userId: UserId): string {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return 'Channel not found';
    }

    const executorId = this.chat.getExecutorId();
    if (!channel.metadata.moderators.has(executorId)) {
      return 'Only moderators can remove members from the channel';
    }

    if (!channel.metadata.members.has(userId)) {
      return 'User is not a member of this channel';
    }

    if (channel.metadata.moderators.has(userId)) {
      channel.metadata.moderators.delete(userId);
    }

    channel.metadata.members.delete(userId);
    this.persistChannel(channelId, channel);
    return 'Member removed from channel';
  }

  private createChannelInfo(params: {
    creatorId: UserId;
    creatorUsername: string;
    type: ChannelType;
    readOnly: boolean;
    members: UserId[];
    moderators: UserId[];
    createdAt?: bigint;
  }): ChannelInfo {
    const moderators = new UnorderedSet<UserId>();
    params.moderators.forEach(id => moderators.add(id));

    const members = new UnorderedSet<UserId>();
    params.members.forEach(id => members.add(id));

    return {
      messages: new Vector<string>(),
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
        info.metadata.members.add(userId);
        this.persistChannel(defaultChannelId, info);
      }
    });
  }
}
