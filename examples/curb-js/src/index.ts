import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

import { ChannelsHandler } from './channels/ChannelsHandler';
import { ChannelType, type ChannelCreationOptions, type ChannelDefaultInit, type ChannelInfo } from './channels/types';
import type { ChatMemberAccess, ChatState, ChannelId, UserId } from './types';
import {
  ensureMemberRegistered,
  isUsernameAvailable,
  normalizeUsername,
  validateUsername
} from './utils/chatUtils';

@State
export class CurbChat implements ChatState {
  owner: UserId = '' as UserId;
  createdAt: bigint = 0n;
  members: UnorderedMap<UserId, string> = new UnorderedMap<UserId, string>();
  channels: UnorderedMap<ChannelId, ChannelInfo> = new UnorderedMap<ChannelId, ChannelInfo>();
  isDMchat = false;
}

class ChatHandler implements ChatMemberAccess {
  constructor(private readonly state: ChatState) {}

  initialize(ownerId: UserId, ownerUsername: string): void {
    this.state.members = new UnorderedMap<UserId, string>();
    const normalized = normalizeUsername(ownerUsername);
    const validationError = validateUsername(normalized);
    if (validationError) {
      throw new Error(`Invalid owner username: ${validationError}`);
    }
    this.state.members.set(ownerId, normalized);
  }

  join(username: string): string {
    const executorId = this.getExecutorId();

    if (this.state.members.has(executorId)) {
      return 'Already a member of the chat';
    }

    const normalized = normalizeUsername(username);
    const validationError = validateUsername(normalized);
    if (validationError) {
      return validationError;
    }

    if (!isUsernameAvailable(this.state, normalized)) {
      return 'Username is already taken';
    }

    this.state.members.set(executorId, normalized);
    this.addExecutorToDefaultChannels(executorId);
    return 'Successfully joined the chat';
  }

  getGlobalMembers(): UserId[] {
    return this.state.members.keys();
  }

  getUsername(userId: UserId): string | null {
    return this.state.members.get(userId);
  }

  ensureMemberExists(userId: UserId, username?: string): string | null {
    return ensureMemberRegistered(this.state, userId, username);
  }

  getExecutorId(): UserId {
    return env.executorIdBase58();
  }

  private addExecutorToDefaultChannels(executorId: UserId): void {
    this.state.channels.entries().forEach(([channelId, info]) => {
      if (info.type !== ChannelType.Default) {
        return;
      }

      if (!info.metadata.members.has(executorId)) {
        info.metadata.members.add(executorId);
        this.state.channels.set(channelId, info);
      }
    });
  }
}

@Logic(CurbChat)
export class CurbLogicChat extends CurbChat {
  private createChatHandler(): ChatHandler {
    return new ChatHandler(this);
  }

  private createChannelsHandler(chatHandler?: ChatHandler): ChannelsHandler {
    return new ChannelsHandler(this, chatHandler ?? this.createChatHandler());
  }

  @Init
  static init({
    ownerUsername,
    defaultChannels = [],
    isDMchat = false
  }: {
    ownerUsername: string;
    defaultChannels?: ChannelDefaultInit[];
    isDMchat?: boolean;
  }): CurbChat {
    const chat = new CurbChat();

    chat.owner = env.executorIdBase58();
    chat.isDMchat = isDMchat;
    chat.createdAt = env.timeNow();

    const chatHandler = new ChatHandler(chat);
    chatHandler.initialize(chat.owner, ownerUsername);

    const channelHandler = new ChannelsHandler(chat, chatHandler);
    channelHandler.bootstrapDefaultChannels(defaultChannels, ownerUsername);

    return chat;
  }

  getGlobalMembers(): UserId[] {
    return this.createChatHandler().getGlobalMembers();
  }

  getChannel(channelId: ChannelId): ChannelInfo | null {
    return this.createChannelsHandler().getChannel(channelId);
  }

  getChannels(): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    const chatHandler = this.createChatHandler();
    return this.createChannelsHandler(chatHandler).getChannelsForUser(chatHandler.getExecutorId());
  }

  getAllChannels(): Array<{ channelId: ChannelId; info: ChannelInfo }> {
    return this.createChannelsHandler().getDefaultAndPublicChannels();
  }

  joinChat(username: string): string {
    return this.createChatHandler().join(username);
  }

  createChannel(channelId: ChannelId, options: ChannelCreationOptions = {}): string {
    return this.createChannelsHandler().createChannel(channelId, options);
  }

  deleteChannel(channelId: ChannelId): string {
    return this.createChannelsHandler().deleteChannel(channelId);
  }

  addChannelModerator(channelId: ChannelId, userId: UserId): string {
    return this.createChannelsHandler().addChannelModerator(channelId, userId);
  }

  removeChannelModerator(channelId: ChannelId, userId: UserId): string {
    return this.createChannelsHandler().removeChannelModerator(channelId, userId);
  }

  addMemberToChannel(channelId: ChannelId, userId: UserId, username?: string): string {
    return this.createChannelsHandler().addMemberToChannel(channelId, userId, username);
  }
}
