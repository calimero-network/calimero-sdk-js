import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

import { ChannelsHandler } from './channels/ChannelsHandler';
import {
  ChannelType,
  type ChannelCreationOptions,
  type ChannelDefaultInit,
  type ChannelInfo
} from './channels/types';
import type { ChatMemberAccess, ChatState, ChannelId, UserId } from './types';
import {
  ensureMemberRegistered,
  isUsernameAvailable,
  normalizeUsername,
  validateUsername
} from './utils/chatUtils';

function wrapResult(value: unknown): string {
  return JSON.stringify(
    { result: value },
    (_key, val) => (typeof val === 'bigint' ? val.toString() : val)
  );
}

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

  getGlobalMembers(): Record<UserId, string> {
    return this.state.members.entries().reduce<Record<UserId, string>>((acc, [userId, username]) => {
      acc[userId] = username;
      return acc;
    }, {} as Record<UserId, string>);
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

  getGlobalMembers(): string {
    return wrapResult(this.createChatHandler().getGlobalMembers());
  }

  getChannel(arg: { channelId: ChannelId } | ChannelId): string {
    const channelId = typeof arg === 'string' ? arg : arg?.channelId;
    if (typeof channelId !== 'string') {
      return wrapResult(null);
    }
    const channel = this.createChannelsHandler().getChannel(channelId);
    return wrapResult(channel);
  }

  getChannels(): string {
    const chatHandler = this.createChatHandler();
    const channels = this.createChannelsHandler(chatHandler).getChannelsForUser(chatHandler.getExecutorId());
    return wrapResult(channels);
  }

  getAllChannels(): string {
    const channels = this.createChannelsHandler().getDefaultAndPublicChannels();
    return wrapResult(channels);
  }

  joinChat(arg: { username: string } | string): string {
    const username = typeof arg === 'string' ? arg : arg?.username ?? '';
    const result = this.createChatHandler().join(username);
    return wrapResult(result);
  }

  createChannel(
    arg: { channelId: ChannelId; options?: ChannelCreationOptions } | ChannelId,
    maybeOptions?: ChannelCreationOptions
  ): string {
    if (typeof arg === 'string') {
      return wrapResult(this.createChannelsHandler().createChannel(arg, maybeOptions));
    }
    if (arg && typeof arg === 'object' && typeof arg.channelId === 'string') {
      return wrapResult(this.createChannelsHandler().createChannel(arg.channelId, arg.options));
    }
    return wrapResult('Invalid channelId');
  }

  deleteChannel(arg: { channelId: ChannelId } | ChannelId): string {
    const channelId = typeof arg === 'string' ? arg : arg?.channelId;
    if (typeof channelId !== 'string') {
      return wrapResult('Invalid channelId');
    }
    return wrapResult(this.createChannelsHandler().deleteChannel(channelId));
  }

  addChannelModerator(arg: { channelId: ChannelId; userId: UserId } | ChannelId, maybeUserId?: UserId): string {
    if (typeof arg === 'string') {
      if (typeof maybeUserId !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsHandler().addChannelModerator(arg, maybeUserId));
    }
    if (arg && typeof arg === 'object' && typeof arg.channelId === 'string' && typeof arg.userId === 'string') {
      return wrapResult(this.createChannelsHandler().addChannelModerator(arg.channelId, arg.userId));
    }
    return wrapResult('Invalid arguments');
  }

  removeChannelModerator(arg: { channelId: ChannelId; userId: UserId } | ChannelId, maybeUserId?: UserId): string {
    if (typeof arg === 'string') {
      if (typeof maybeUserId !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsHandler().removeChannelModerator(arg, maybeUserId));
    }
    if (arg && typeof arg === 'object' && typeof arg.channelId === 'string' && typeof arg.userId === 'string') {
      return wrapResult(this.createChannelsHandler().removeChannelModerator(arg.channelId, arg.userId));
    }
    return wrapResult('Invalid arguments');
  }

  addMemberToChannel(
    arg: { channelId: ChannelId; userId: UserId; username?: string } | ChannelId,
    userIdMaybe?: UserId,
    usernameMaybe?: string
  ): string {
    if (typeof arg === 'string') {
      if (typeof userIdMaybe !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsHandler().addMemberToChannel(arg, userIdMaybe, usernameMaybe));
    }
    if (arg && typeof arg === 'object' && typeof arg.channelId === 'string' && typeof arg.userId === 'string') {
      return wrapResult(this.createChannelsHandler().addMemberToChannel(arg.channelId, arg.userId, arg.username));
    }
    return wrapResult('Invalid arguments');
  }

  removeMemberFromChannel(arg: { channelId: ChannelId; userId: UserId } | ChannelId, maybeUserId?: UserId): string {
    if (typeof arg === 'string') {
      if (typeof maybeUserId !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsHandler().removeMemberFromChannel(arg, maybeUserId));
    }
    if (arg && typeof arg === 'object' && typeof arg.channelId === 'string' && typeof arg.userId === 'string') {
      return wrapResult(this.createChannelsHandler().removeMemberFromChannel(arg.channelId, arg.userId));
    }
    return wrapResult('Invalid arguments');
  }
}
