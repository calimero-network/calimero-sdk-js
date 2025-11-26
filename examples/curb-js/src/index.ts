import { env, Init, Logic, State, View, createUnorderedMap, createVector, createLwwRegister, createUnorderedSet } from "@calimero/sdk";
import { UnorderedMap, UnorderedSet, Vector, LwwRegister } from "@calimero/sdk/collections";

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
  type ReadMessageProps,
  type ReadDmProps,
  type UpdateDmHashProps,
  type StoredMessage,
} from "./messageManagement";
import { isUsernameTaken } from "./utils/members";

@State
export class CurbChat {
  owner: UserId = "";
  members: UnorderedMap<UserId, Username> = createUnorderedMap();
  channels: UnorderedMap<ChannelId, ChannelMetadata> = createUnorderedMap();
  dmChats: UnorderedMap<UserId, Vector<DMChatInfo>> = createUnorderedMap();
  // Track last read message timestamp per user per channel
  channelReadPositions: UnorderedMap<ChannelId, UnorderedMap<UserId, LwwRegister<bigint>>> = createUnorderedMap();
  // Track last read hash per user per DM context
  dmReadHashes: UnorderedMap<string, UnorderedMap<UserId, LwwRegister<string>>> = createUnorderedMap();
}

@Logic(CurbChat)
export class CurbChatLogic extends CurbChat {
  @Init
  static init({ 
    ownerUsername, 
    defaultChannels = [], 
    isDm = false, 
    invitee, 
    inviteeUsername 
  }: InitParams): CurbChat {
    const executorId = env.executorIdBase58();
    const timestamp = env.timeNow();

    const chat = new CurbChat();
    chat.owner = executorId;
    chat.members = createUnorderedMap<UserId, Username>();
    chat.channels = createUnorderedMap<ChannelId, ChannelMetadata>();
    chat.dmChats = createUnorderedMap<UserId, Vector<DMChatInfo>>();
    chat.channelReadPositions = createUnorderedMap<ChannelId, UnorderedMap<UserId, LwwRegister<bigint>>>();
    chat.dmReadHashes = createUnorderedMap<string, UnorderedMap<UserId, LwwRegister<string>>>();

    // Add owner to members and map username
    chat.members.set(executorId, ownerUsername);

    // If DM, add invitee to members and map their username
    if (isDm && invitee) {
      chat.members.set(invitee, inviteeUsername ?? invitee);
    }

    // Create default channels
    for (const { name } of defaultChannels) {
      this.addDefaultChannelToState(
        chat, 
        executorId, 
        ownerUsername, 
        timestamp, 
        name,
        isDm ? invitee : undefined,
        isDm ? inviteeUsername : undefined
      );
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
    const members = channel.channelMembers.get();
    if (!members || !members.has(executorId)) {
      return this.wrapResult("Only channel members can view invitees");
    }

    // Get all channel member IDs
    const channelMemberIds = new Set(members.toArray());

    const invitees = this.members
      .entries()
      .filter(([userId]) => !channelMemberIds.has(userId))
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

    const username = this.members.get(executorId) ?? executorId;
    const message = this.getMessageManager().sendMessage(executorId, username, args);
    return this.wrapResult(message);
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

    const moderators = channel.channelModerators.get();
    const isModerator =
      (moderators?.has(executorId) ?? false) ||
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
    
    // Find the message to get its channelId and verify access
    const channelId = this.getMessageManager().findMessageChannelId(args.messageId);
    if (!channelId) {
      return this.wrapResult("Message not found");
    }

    // Verify the user has access to the channel containing this message
    const channel = this.ensureChannelAccess(channelId, executorId);
    if (typeof channel === "string") {
      return this.wrapResult(channel);
    }

    // Get username from global members
    // Use provided username or fallback to global members
    const username = args.username ?? this.members.get(executorId) ?? executorId;

    const result = this.getMessageManager().updateReaction(args, username);
    return this.wrapResult(result);
  }

  readMessage(rawInput: ReadMessageProps | { input: ReadMessageProps }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.channelId !== "string" || typeof args.messageId !== "string") {
      return this.wrapResult("Invalid read message input");
    }

    const executorId = this.getExecutorId();
    const channel = this.ensureChannelAccess(args.channelId, executorId);
    if (typeof channel === "string") {
      return this.wrapResult(channel);
    }

    const result = this.getMessageManager().readMessage(executorId, args, channel);
    return this.wrapResult(result);
  }

  updateDmHash(rawInput: UpdateDmHashProps | { input: UpdateDmHashProps }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.contextId !== "string" || typeof args.newHash !== "string") {
      return this.wrapResult("Invalid update DM hash input");
    }

    const executorId = this.getExecutorId();
    const result = this.getDmManager().updateDmHash(executorId, args.contextId, args.newHash);
    return this.wrapResult(result);
  }

  readDm(rawInput: ReadDmProps | { input: ReadDmProps }): string {
    const args = this.extractInput(rawInput);
    if (!args || typeof args.contextId !== "string") {
      return this.wrapResult("Invalid read DM input");
    }

    const executorId = this.getExecutorId();
    const result = this.getDmManager().readDm(executorId, args.contextId);
    return this.wrapResult(result);
  }

  private getChannelManager(): ChannelManager {
    return new ChannelManager({
      owner: this.owner,
      members: this.members,
      channels: this.channels,
      channelReadPositions: this.channelReadPositions,
    });
  }

  private getDmManager(): DmManagement {
    return new DmManagement(this.dmChats, this.dmReadHashes);
  }

  private getMessageManager(): MessageManagement {
    return new MessageManagement(this.channels, this.channelReadPositions);
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
    // Normalize channelId to match how channels are stored (trim + lowercase)
    const normalizedId = channelId.trim().toLowerCase();
    if (!normalizedId) {
      return "Invalid channel id";
    }
    
    const channel = this.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }
    
    const members = channel.channelMembers.get();
    if (!members || !members.has(executorId)) {
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
    invitee?: UserId,
    _inviteeUsername?: Username,
  ): void {
    const channelId = rawName.trim().toLowerCase();
    if (!channelId || state.channels.has(channelId)) {
      return;
    }

    // Add owner as member and moderator
    const membersSet = createUnorderedSet<UserId>();
    membersSet.add(ownerId);
    if (invitee) {
      membersSet.add(invitee);
    }
    const membersRegister = createLwwRegister<UnorderedSet<UserId>>({ initialValue: membersSet });
    
    const moderatorsSet = createUnorderedSet<UserId>();
    moderatorsSet.add(ownerId);
    const moderatorsRegister = createLwwRegister<UnorderedSet<UserId>>({ initialValue: moderatorsSet });
    
    // Initialize channel messages, thread messages, and reactions
    const channelMessagesVector = createVector<StoredMessage>();
    const channelMessagesRegister = createLwwRegister<Vector<StoredMessage>>({ initialValue: channelMessagesVector });
    const threadMessages = createUnorderedMap<string, LwwRegister<Vector<StoredMessage>>>();
    const messageReactions = createUnorderedMap<string, UnorderedMap<string, UnorderedSet<UserId>>>();

    const metadata: ChannelMetadata = {
      type: ChannelType.Default,
      createdAt: timestamp,
      createdBy: ownerId,
      createdByUsername: ownerUsername,
      readOnly: false,
      channelMembers: membersRegister,
      channelModerators: moderatorsRegister,
      channelMessages: channelMessagesRegister,
      threadMessages: threadMessages,
      messageReactions: messageReactions,
    };

    state.channels.set(channelId, metadata);
  }
}