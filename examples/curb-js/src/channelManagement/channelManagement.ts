import { env } from "@calimero/sdk";
import { UnorderedMap } from "@calimero/sdk/collections";

import { isUsernameTaken } from "../utils/members";
import type { ChannelId, UserId, Username } from "../types";
import {
  ChannelType,
  type ChannelDirectoryResponse,
  type ChannelMembershipEntry,
  type ChannelMembershipInput,
  type ChannelMetadata,
  type ChannelMetadataResponse,
  type CreateChannelInput,
  type ModeratorInput,
} from "./types";

export interface ChannelState {
  owner: UserId;
  members: UnorderedMap<UserId, Username>;
  channels: UnorderedMap<ChannelId, ChannelMetadata>;
}

export class ChannelManager {
  constructor(private readonly state: ChannelState) {}

  listForMember(userId: UserId): ChannelMetadataResponse[] {
    const channels: ChannelMetadataResponse[] = [];

    this.state.channels.entries().forEach(([channelId, metadata]) => {
      if (metadata.members.has(userId)) {
        channels.push(this.formatChannelResponse(channelId, metadata));
      }
    });

    return channels;
  }

  listDirectory(userId: UserId): ChannelDirectoryResponse {
    const joined: ChannelMetadataResponse[] = [];
    const availablePublic: ChannelMetadataResponse[] = [];

    this.state.channels.entries().forEach(([channelId, metadata]) => {
      const formatted = this.formatChannelResponse(channelId, metadata);
      if (metadata.members.has(userId)) {
        joined.push(formatted);
      } else if (metadata.type === ChannelType.Public) {
        availablePublic.push(formatted);
      }
    });

    return { joined, availablePublic };
  }

  createChannel(input: CreateChannelInput, executorId: UserId, executorUsername: Username | undefined): string {
    const name = input.name?.trim();
    if (!name) {
      return "Channel name cannot be empty";
    }

    if (!executorUsername) {
      return "Executor must join the chat before creating channels";
    }

    const normalizedId = this.normalizeChannelId(name);
    if (this.state.channels.has(normalizedId)) {
      return "Channel already exists";
    }

    const type = input.type ?? ChannelType.Public;
    if (type === ChannelType.Default) {
      return "Default channels can only be created during initialization";
    }

    if (type !== ChannelType.Public && type !== ChannelType.Private) {
      return "Channel type must be public or private";
    }

    const moderators = new UnorderedMap<UserId, Username>();
    moderators.set(executorId, executorUsername);

    const members = new UnorderedMap<UserId, Username>();
    members.set(executorId, executorUsername);

    const metadata: ChannelMetadata = {
      type,
      createdAt: env.timeNow(),
      createdBy: executorId,
      createdByUsername: executorUsername,
      readOnly: input.readOnly ?? false,
      moderators,
      members,
    };

    this.state.channels.set(normalizedId, metadata);
    return "Channel created";
  }

  addUserToChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const channel = this.getChannelOrNull(input.channelId);
    if (!channel) {
      return "Channel not found";
    }

    if (!channel.moderators.has(executorId)) {
      return "Only moderators can add members to the channel";
    }

    if (channel.members.has(input.userId)) {
      return "User is already a member of the channel";
    }

    let username = this.state.members.get(input.userId);
    if (!username) {
      const provided = input.username?.trim();
      if (!provided) {
        return "Username is required for new members";
      }
      if (isUsernameTaken(this.state.members, provided)) {
        return "Username is already taken";
      }
      this.state.members.set(input.userId, provided);
      username = provided;
    }

    channel.members.set(input.userId, username);
    this.state.channels.set(this.normalizeChannelId(input.channelId), channel);
    return "Member added to channel";
  }

  removeUserFromChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const channel = this.getChannelOrNull(input.channelId);
    if (!channel) {
      return "Channel not found";
    }

    if (!channel.moderators.has(executorId)) {
      return "Only moderators can remove members from the channel";
    }

    if (!channel.members.has(input.userId)) {
      return "User is not a member of the channel";
    }

    channel.moderators.remove(input.userId);
    channel.members.remove(input.userId);
    this.state.channels.set(this.normalizeChannelId(input.channelId), channel);
    return "Member removed from channel";
  }

  promoteModerator(input: ModeratorInput, executorId: UserId): string {
    const channel = this.getChannelOrNull(input.channelId);
    if (!channel) {
      return "Channel not found";
    }

    if (!channel.moderators.has(executorId)) {
      return "Only moderators can promote other members";
    }

    if (!channel.members.has(input.userId)) {
      return "User must be a member of the channel";
    }

    const username = this.state.members.get(input.userId);
    if (!username) {
      return "User must join the chat first";
    }

    channel.moderators.set(input.userId, username);
    this.state.channels.set(this.normalizeChannelId(input.channelId), channel);
    return "Moderator added";
  }

  demoteModerator(input: ModeratorInput, executorId: UserId): string {
    const channel = this.getChannelOrNull(input.channelId);
    if (!channel) {
      return "Channel not found";
    }

    if (!channel.moderators.has(executorId)) {
      return "Only moderators can demote moderators";
    }

    if (!channel.moderators.has(input.userId)) {
      return "User is not a moderator";
    }

    channel.moderators.remove(input.userId);
    this.state.channels.set(this.normalizeChannelId(input.channelId), channel);
    return "Moderator removed";
  }

  deleteChannel(channelId: ChannelId, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }

    if (channel.type === ChannelType.Default) {
      return "Default channels cannot be deleted";
    }

    if (!channel.moderators.has(executorId)) {
      return "Only moderators can delete a channel";
    }

    this.state.channels.remove(normalizedId);
    return "Channel deleted";
  }

  joinPublicChannel(channelId: ChannelId, executorId: UserId): string {
    const channel = this.getChannelOrNull(channelId);
    if (!channel) {
      return "Channel not found";
    }

    if (channel.type !== ChannelType.Public) {
      return "Channel is not public";
    }

    if (channel.members.has(executorId)) {
      return "Already a member of the channel";
    }

    const username = this.state.members.get(executorId);
    if (!username) {
      return "Join the chat before joining channels";
    }

    channel.members.set(executorId, username);
    this.state.channels.set(this.normalizeChannelId(channelId), channel);
    return "Joined channel";
  }

  private getChannelOrNull(channelId: ChannelId): ChannelMetadata | null {
    return this.state.channels.get(this.normalizeChannelId(channelId)) ?? null;
  }

  private normalizeChannelId(channelId: ChannelId): ChannelId {
    return channelId.trim().toLowerCase();
  }

  private formatChannelResponse(channelId: ChannelId, metadata: ChannelMetadata): ChannelMetadataResponse {
    return {
      channelId,
      type: metadata.type,
      createdAt: metadata.createdAt.toString(),
      createdBy: metadata.createdBy,
      createdByUsername: metadata.createdByUsername,
      readOnly: metadata.readOnly,
      moderators: this.formatMembership(metadata.moderators),
      members: this.formatMembership(metadata.members),
    };
  }

  private formatMembership(map: UnorderedMap<UserId, Username>): ChannelMembershipEntry[] {
    return map.entries().map(([userId, username]) => ({
      publicKey: userId,
      username,
    }));
  }
}

