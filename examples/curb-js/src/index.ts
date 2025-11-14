import { env, Init, Logic, State, View } from "@calimero/sdk";
import { UnorderedMap, UnorderedSet, Vector } from "@calimero/sdk/collections";

import { ChannelManager } from "./channelManagement/channelManagement";
import {
  ChannelType,
  type ChannelMembershipInput,
  type ChannelMetadata,
  type CreateChannelInput,
  type ModeratorInput,
} from "./channelManagement/types";
import type {
  ChannelId,
  InitParams,
  UserId,
  Username,
} from "./types";
import {
  DmManagement,
  type DMChatInfo,
  type CreateDMChatArgs,
  type UpdateIdentityArgs,
  type DeleteDMArgs,
} from "./dmManagement";
import {
  MessageManagement,
  type SendMessageArgs,
  type GetMessagesArgs,
  type EditMessageArgs,
  type DeleteMessageArgs,
  type UpdateReactionArgs,
  type StoredMessage,
} from "./messageManagement";
import { isUsernameTaken } from "./utils/members";

@State
export class CurbChat {
  owner: UserId = "";
  members: UnorderedMap<UserId, Username> = new UnorderedMap();
  channels: UnorderedMap<ChannelId, ChannelMetadata> = new UnorderedMap();
  dmChats: UnorderedMap<UserId, Vector<DMChatInfo>> = new UnorderedMap();
  channelMessages: UnorderedMap<ChannelId, Vector<StoredMessage>> = new UnorderedMap();
  threadMessages: UnorderedMap<string, Vector<StoredMessage>> = new UnorderedMap();
  messageReactions: UnorderedMap<string, UnorderedMap<string, UnorderedSet<UserId>>> =
    new UnorderedMap();
}

@Logic(CurbChat)
export class CurbChatLogic extends CurbChat {
  @Init
  static init({ ownerUsername, defaultChannels = [] }: InitParams): CurbChat {
    const executorId = env.executorIdBase58();
    const timestamp = env.timeNow();

    const chat = new CurbChat();
    chat.owner = executorId;
    chat.members = new UnorderedMap<UserId, Username>();
    chat.channels = new UnorderedMap<ChannelId, ChannelMetadata>();
    chat.dmChats = new UnorderedMap<UserId, Vector<DMChatInfo>>();
    chat.channelMessages = new UnorderedMap<ChannelId, Vector<StoredMessage>>();
    chat.threadMessages = new UnorderedMap<string, Vector<StoredMessage>>();
    chat.messageReactions = new UnorderedMap<
      string,
      UnorderedMap<string, UnorderedSet<UserId>>
    >();

    chat.members.set(executorId, ownerUsername);

    for (const { name } of defaultChannels) {
      this.addDefaultChannelToState(chat, executorId, ownerUsername, timestamp, name);
    }

    env.log("CurbChat initialized.");
    return chat;
  }

  @View()
  getUsername(): string {
    const executorId = this.getExecutorId();
    const username = this.members.get(executorId) ?? "";
    return this.wrapResult(username);
  }

  @View()
  getChannels(): string {
    const executorId = this.getExecutorId();
    const channels = this.getChannelManager().listForMember(executorId);
    return this.wrapResult(channels);
  }

  @View()
  getChannelDirectory(): string {
    const executorId = this.getExecutorId();
    const directory = this.getChannelManager().listDirectory(executorId);
    return this.wrapResult(directory);
  }

  @View()
  getMembers(): string {
    const members = this.members.entries().map(([userId, username]) => ({
      userId,
      username,
    }));

    return this.wrapResult(members);
  }

  @View()
  getDMs(): string {
    const executorId = this.getExecutorId();
    return this.wrapResult(this.getDmManager().getDMs(executorId));
  }

  createDMChat(rawInput: CreateDMChatArgs | { input: CreateDMChatArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args) {
      return this.wrapResult("Invalid DM input");
    }

    const executorId = this.getExecutorId();
    const usernames = this.members.entries().reduce<Record<UserId, string>>((acc, [id, name]) => {
      acc[id] = name;
      return acc;
    }, {});

    const result = this.getDmManager().createDMChat(executorId, args, usernames);
    return this.wrapResult(result);
  }

  updateNewIdentity(rawInput: UpdateIdentityArgs | { input: UpdateIdentityArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args) {
      return this.wrapResult("Invalid identity input");
    }

    const executorId = this.getExecutorId();
    const result = this.getDmManager().updateNewIdentity(executorId, args);
    return this.wrapResult(result);
  }

  deleteDM(rawInput: DeleteDMArgs | { input: DeleteDMArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args) {
      return this.wrapResult("Invalid delete input");
    }

    const executorId = this.getExecutorId();
    const result = this.getDmManager().deleteDM(executorId, args);
    return this.wrapResult(result);
  }

  joinChat(
    rawInput:
      | { username: Username; userId?: UserId }
      | { input: { username: Username; userId?: UserId } },
  ): string {
    const input = this.extractInput(rawInput);
    if (!input || typeof input.username !== "string") {
      return this.wrapResult("Username is required");
    }

    const userId = input.userId ?? this.getExecutorId();
    if (this.members.has(userId)) {
      return this.wrapResult("User is already a member of the chat");
    }

    const username = input.username.trim();
    if (!username) {
      return this.wrapResult("Username is required");
    }

    if (isUsernameTaken(this.members, username)) {
      return this.wrapResult("Username is already taken");
    }

    this.members.set(userId, username);
    this.getChannelManager().addUserToDefaultChannels(userId, username);
    return this.wrapResult("User joined chat");
  }

  createChannel(rawInput: CreateChannelInput | { input: CreateChannelInput }): string {
    const input = this.extractInput(rawInput);
    if (!input) {
      return this.wrapResult("Invalid channel input");
    }

    const executorId = this.getExecutorId();
    const executorUsername = this.members.get(executorId);

    const result = this.getChannelManager().createChannel(
      input,
      executorId,
      executorUsername ?? undefined,
    );
    return this.wrapResult(result);
  }

  addUserToChannel(rawInput: ChannelMembershipInput | { input: ChannelMembershipInput }): string {
    const input = this.extractInput(rawInput);
    if (!input) {
      return this.wrapResult("Invalid channel membership input");
    }

    const result = this.getChannelManager().addUserToChannel(input, this.getExecutorId());
    return this.wrapResult(result);
  }

  removeUserFromChannel(
    rawInput: ChannelMembershipInput | { input: ChannelMembershipInput },
  ): string {
    const input = this.extractInput(rawInput);
    if (!input) {
      return this.wrapResult("Invalid channel membership input");
    }

    const result = this.getChannelManager().removeUserFromChannel(input, this.getExecutorId());
    return this.wrapResult(result);
  }

  promoteModerator(rawInput: ModeratorInput | { input: ModeratorInput }): string {
    const input = this.extractInput(rawInput);
    if (!input) {
      return this.wrapResult("Invalid moderator input");
    }

    const result = this.getChannelManager().promoteModerator(input, this.getExecutorId());
    return this.wrapResult(result);
  }

  demoteModerator(rawInput: ModeratorInput | { input: ModeratorInput }): string {
    const input = this.extractInput(rawInput);
    if (!input) {
      return this.wrapResult("Invalid moderator input");
    }

    const result = this.getChannelManager().demoteModerator(input, this.getExecutorId());
    return this.wrapResult(result);
  }

  deleteChannel(rawInput: ChannelId | { input: { channelId: ChannelId } }): string {
    const channelId =
      typeof rawInput === "string" ? rawInput : this.extractInput(rawInput)?.channelId;
    if (!channelId) {
      return this.wrapResult("Invalid channel id");
    }

    const result = this.getChannelManager().deleteChannel(channelId, this.getExecutorId());
    return this.wrapResult(result);
  }

  joinPublicChannel(rawInput: ChannelId | { input: { channelId: ChannelId } }): string {
    const channelId =
      typeof rawInput === "string" ? rawInput : this.extractInput(rawInput)?.channelId;
    if (!channelId) {
      return this.wrapResult("Invalid channel id");
    }

    const result = this.getChannelManager().joinPublicChannel(channelId, this.getExecutorId());
    return this.wrapResult(result);
  }

  leaveChannel(rawInput: ChannelId | { input: { channelId: ChannelId } }): string {
    const channelId =
      typeof rawInput === "string" ? rawInput : this.extractInput(rawInput)?.channelId;
    if (!channelId) {
      return this.wrapResult("Invalid channel id");
    }

    const result = this.getChannelManager().leaveChannel(channelId, this.getExecutorId());
    return this.wrapResult(result);
  }

  @View()
  getInvitees(rawInput: ChannelId | { input: { channelId: ChannelId } }): string {
    const channelId =
      typeof rawInput === "string" ? rawInput : this.extractInput(rawInput)?.channelId;
    if (!channelId) {
      return this.wrapResult("Invalid channel id");
    }

    const normalizedId = channelId.trim().toLowerCase();
    if (!normalizedId) {
      return this.wrapResult("Invalid channel id");
    }

    const channel = this.channels.get(normalizedId);
    if (!channel) {
      return this.wrapResult("Channel not found");
    }

    const executorId = this.getExecutorId();
    if (!channel.members.has(executorId)) {
      return this.wrapResult("Only channel members can view invitees");
    }

    const invitees = this.members
      .entries()
      .filter(([userId]) => !channel.members.has(userId))
      .map(([userId, username]) => ({ userId, username }));

    return this.wrapResult(invitees);
  }

  sendMessage(rawInput: SendMessageArgs | { input: SendMessageArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.channelId !== "string" || typeof args.text !== "string") {
      return this.wrapResult("Invalid message input");
    }

    const executorId = this.getExecutorId();
    const channel = this.ensureChannelAccess(args.channelId, executorId);
    if (typeof channel === "string") {
      return this.wrapResult(channel);
    }

    const username =
      channel.members.get(executorId) ?? this.members.get(executorId) ?? executorId;
    const messageId = this.getMessageManager().sendMessage(executorId, username, args);
    return this.wrapResult(messageId);
  }

  @View()
  getMessages(rawInput: GetMessagesArgs | { input: GetMessagesArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.channelId !== "string") {
      return this.wrapResult("Invalid message input");
    }

    const executorId = this.getExecutorId();
    const channel = this.ensureChannelAccess(args.channelId, executorId);
    if (typeof channel === "string") {
      return this.wrapResult(channel);
    }

    const messages = this.getMessageManager().getMessages(args);
    return this.wrapResult(messages);
  }

  editMessage(rawInput: EditMessageArgs | { input: EditMessageArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.channelId !== "string" || typeof args.messageId !== "string") {
      return this.wrapResult("Invalid edit input");
    }

    const executorId = this.getExecutorId();
    const channel = this.ensureChannelAccess(args.channelId, executorId);
    if (typeof channel === "string") {
      return this.wrapResult(channel);
    }

    const result = this.getMessageManager().editMessage(executorId, args);
    return this.wrapResult(result);
  }

  deleteMessage(rawInput: DeleteMessageArgs | { input: DeleteMessageArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.channelId !== "string" || typeof args.messageId !== "string") {
      return this.wrapResult("Invalid delete input");
    }

    const executorId = this.getExecutorId();
    const channel = this.ensureChannelAccess(args.channelId, executorId);
    if (typeof channel === "string") {
      return this.wrapResult(channel);
    }

    const isModerator =
      channel.moderators.has(executorId) ||
      channel.createdBy === executorId ||
      this.owner === executorId;

    const result = this.getMessageManager().deleteMessage(executorId, args, isModerator);
    return this.wrapResult(result);
  }

  updateReaction(rawInput: UpdateReactionArgs | { input: UpdateReactionArgs }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.messageId !== "string" || typeof args.emoji !== "string") {
      return this.wrapResult("Invalid reaction input");
    }

    const executorId = this.getExecutorId();
    const result = this.getMessageManager().updateReaction(executorId, args);
    return this.wrapResult(result);
  }

  private getChannelManager(): ChannelManager {
    return new ChannelManager(this);
  }

  private getDmManager(): DmManagement {
    return new DmManagement(this.dmChats);
  }

  private getMessageManager(): MessageManagement {
    return new MessageManagement(this.channelMessages, this.threadMessages, this.messageReactions);
  }

  private getExecutorId(): UserId {
    return env.executorIdBase58();
  }

  private wrapResult(value: unknown): string {
    return JSON.stringify(
      { result: value },
      (_key, val) => (typeof val === "bigint" ? val.toString() : val),
    );
  }

  private extractInput<T>(raw: T | { input?: T } | { input: T } | undefined): T | null {
    if (!raw) {
      return null;
    }

    if (typeof raw === "object" && raw !== null && "input" in raw) {
      const candidate = (raw as { input?: T }).input;
      return candidate ?? null;
    }

    return raw as T;
  }

  private ensureChannelAccess(channelId: ChannelId, executorId: UserId): ChannelMetadata | string {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return "Channel not found";
    }
    if (!channel.members.has(executorId)) {
      return "You are not a member of this channel";
    }
    return channel;
  }

  private static addDefaultChannelToState(
    state: CurbChat,
    ownerId: UserId,
    ownerUsername: Username,
    timestamp: bigint,
    rawName: ChannelId,
  ): void {
    const channelId = rawName.trim().toLowerCase();
    if (!channelId || state.channels.has(channelId)) {
      return;
    }

      const moderators = new UnorderedMap<UserId, Username>();
    moderators.set(ownerId, ownerUsername);

      const members = new UnorderedMap<UserId, Username>();
    members.set(ownerId, ownerUsername);

    const metadata: ChannelMetadata = {
        type: ChannelType.Default,
      createdAt: timestamp,
      createdBy: ownerId,
        createdByUsername: ownerUsername,
        readOnly: false,
      moderators,
      members,
    };

    state.channels.set(channelId, metadata);
  }
}