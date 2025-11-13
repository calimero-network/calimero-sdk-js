import { env, Init, Logic, State, View } from "@calimero/sdk";
import { UnorderedMap } from "@calimero/sdk/collections";

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
import { isUsernameTaken } from "./utils/members";

@State
export class CurbChat {
  owner: UserId = "";
  members: UnorderedMap<UserId, Username> = new UnorderedMap();
  channels: UnorderedMap<ChannelId, ChannelMetadata> = new UnorderedMap();
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

  private getChannelManager(): ChannelManager {
    return new ChannelManager(this);
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