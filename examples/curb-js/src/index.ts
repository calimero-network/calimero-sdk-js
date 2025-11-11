import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap, UnorderedSet, Vector } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

import { ChannelsHandler } from './channels/ChannelsHandler';
import {
  ChannelType,
  type ChannelCreationOptions,
  type ChannelDefaultInit,
  type ChannelInfo,
  type ChannelInfoResponse,
  type ChannelMembershipEntry
} from './channels/types';
import type { ChatMemberAccess, ChatState, ChannelId, UserId } from './types';
import {
  ensureMemberRegistered,
  isUsernameAvailable,
  normalizeUsername,
  validateUsername,
} from './utils/chatUtils';

function wrapResult(value: unknown): string {
  return JSON.stringify(
    { result: normalizeResponseValue(value) },
    (_key, val) => (typeof val === 'bigint' ? val.toString() : val)
  );
}

function normalizeResponseValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return null;
  }

  seen.add(value as object);

  if (value instanceof UnorderedMap) {
    const normalizedEntries = value.entries().map(([key, entryValue]) => [
      normalizeResponseValue(key, seen),
      normalizeResponseValue(entryValue, seen)
    ]) as Array<[unknown, unknown]>;

    if (normalizedEntries.every(([key]) => typeof key === 'string')) {
      const record: Record<string, unknown> = {};
      for (const [key, entryValue] of normalizedEntries) {
        record[key as string] = entryValue;
      }
      return record;
    }

    return normalizedEntries;
  }

  if (value instanceof UnorderedSet) {
    return value.toArray().map(item => normalizeResponseValue(item, seen));
  }

  if (value instanceof Vector) {
    return value.toArray().map(item => normalizeResponseValue(item, seen));
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, entryValue]) => [
      normalizeResponseValue(key, seen),
      normalizeResponseValue(entryValue, seen)
    ]);
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map(item => normalizeResponseValue(item, seen));
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeResponseValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    result[key] = normalizeResponseValue(entryValue, seen);
  }
  return result;
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
    return this.state.members.entries().reduce<Record<UserId, string>>(
      (acc, [userId, username]) => {
        acc[userId] = username;
        return acc;
      },
      {} as Record<UserId, string>
    );
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
        const username = this.state.members.get(executorId);
        if (!username) {
          return;
        }
        info.metadata.members.set(executorId, username);
        this.state.channels.set(channelId, info);
      }
    });
  }
}

@Logic(CurbChat)
export class CurbLogicChat extends CurbChat {
  private createMembersAccess(): ChatHandler {
    return new ChatHandler(this);
  }

  private createChannelsAccess(membersAccess?: ChatHandler): ChannelsHandler {
    return new ChannelsHandler(this, membersAccess ?? this.createMembersAccess());
  }

  @Init
  static init({
    ownerUsername,
    defaultChannels = [],
    isDMchat = false,
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
    return wrapResult(this.createMembersAccess().getGlobalMembers());
  }

  getChannel(arg: { channelId: ChannelId } | ChannelId): string {
    const channelId = typeof arg === 'string' ? arg : arg?.channelId;
    if (typeof channelId !== 'string') {
      return wrapResult(null);
    }
    const channel = this.createChannelsAccess().getChannel(channelId);
    return wrapResult(this.formatChannelInfo(channel));
  }

  getChannels(): string {
    const membersAccess = this.createMembersAccess();
    const channels = this.createChannelsAccess(membersAccess).getChannelsForUser(
      membersAccess.getExecutorId()
    );
    const formatted = channels.map(({ channelId, info }) => ({
      channelId,
      info: this.formatChannelInfo(info)
    }));
    return wrapResult(formatted);
  }

  getAllChannels(): string {
    const channels = this.createChannelsAccess().getDefaultAndPublicChannels();
    const formatted = channels.map(({ channelId, info }) => ({
      channelId,
      info: this.formatChannelInfo(info)
    }));
    return wrapResult(formatted);
  }

  joinChat(arg: { username: string } | string): string {
    const username = typeof arg === 'string' ? arg : (arg?.username ?? '');
    const result = this.createMembersAccess().join(username);
    return wrapResult(result);
  }

  createChannel(
    arg: { channelId: ChannelId; options?: ChannelCreationOptions } | ChannelId,
    maybeOptions?: ChannelCreationOptions
  ): string {
    if (typeof arg === 'string') {
      return wrapResult(this.createChannelsAccess().createChannel(arg, maybeOptions));
    }
    if (arg && typeof arg === 'object' && typeof arg.channelId === 'string') {
      return wrapResult(this.createChannelsAccess().createChannel(arg.channelId, arg.options));
    }
    return wrapResult('Invalid channelId');
  }

  deleteChannel(arg: { channelId: ChannelId } | ChannelId): string {
    const channelId = typeof arg === 'string' ? arg : arg?.channelId;
    if (typeof channelId !== 'string') {
      return wrapResult('Invalid channelId');
    }
    return wrapResult(this.createChannelsAccess().deleteChannel(channelId));
  }

  addChannelModerator(
    arg: { channelId: ChannelId; userId: UserId } | ChannelId,
    maybeUserId?: UserId
  ): string {
    if (typeof arg === 'string') {
      if (typeof maybeUserId !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsAccess().addChannelModerator(arg, maybeUserId));
    }
    if (
      arg &&
      typeof arg === 'object' &&
      typeof arg.channelId === 'string' &&
      typeof arg.userId === 'string'
    ) {
      return wrapResult(
        this.createChannelsAccess().addChannelModerator(arg.channelId, arg.userId)
      );
    }
    return wrapResult('Invalid arguments');
  }

  removeChannelModerator(
    arg: { channelId: ChannelId; userId: UserId } | ChannelId,
    maybeUserId?: UserId
  ): string {
    if (typeof arg === 'string') {
      if (typeof maybeUserId !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsAccess().removeChannelModerator(arg, maybeUserId));
    }
    if (
      arg &&
      typeof arg === 'object' &&
      typeof arg.channelId === 'string' &&
      typeof arg.userId === 'string'
    ) {
      return wrapResult(
        this.createChannelsAccess().removeChannelModerator(arg.channelId, arg.userId)
      );
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
      return wrapResult(
        this.createChannelsAccess().addMemberToChannel(arg, userIdMaybe, usernameMaybe)
      );
    }
    if (
      arg &&
      typeof arg === 'object' &&
      typeof arg.channelId === 'string' &&
      typeof arg.userId === 'string'
    ) {
      return wrapResult(
        this.createChannelsAccess().addMemberToChannel(arg.channelId, arg.userId, arg.username)
      );
    }
    return wrapResult('Invalid arguments');
  }

  removeMemberFromChannel(
    arg: { channelId: ChannelId; userId: UserId } | ChannelId,
    maybeUserId?: UserId
  ): string {
    if (typeof arg === 'string') {
      if (typeof maybeUserId !== 'string') {
        return wrapResult('Invalid arguments');
      }
      return wrapResult(this.createChannelsAccess().removeMemberFromChannel(arg, maybeUserId));
    }
    if (
      arg &&
      typeof arg === 'object' &&
      typeof arg.channelId === 'string' &&
      typeof arg.userId === 'string'
    ) {
      return wrapResult(
        this.createChannelsAccess().removeMemberFromChannel(arg.channelId, arg.userId)
      );
    }
    return wrapResult('Invalid arguments');
  }

  private formatChannelInfo(info: ChannelInfo | null): ChannelInfoResponse | null {
    if (!info) {
      return null;
    }

    return {
      type: info.type,
      metadata: {
        createdAt: info.metadata.createdAt,
        createdBy: info.metadata.createdBy,
        createdByUsername: info.metadata.createdByUsername,
        readOnly: info.metadata.readOnly,
        linksAllowed: info.metadata.linksAllowed,
        moderators: this.formatMembership(info.metadata.moderators),
        members: this.formatMembership(info.metadata.members)
      }
    };
  }

  private formatMembership(userMap: UnorderedMap<UserId, string>): ChannelMembershipEntry[] {
    return userMap.entries().map(([userId, username]) => ({
      publicKey: userId,
      username
    }));
  }
}
