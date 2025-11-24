import { emit, env, createUnorderedMap } from "@calimero/sdk";
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
import {
  ChannelCreated,
  ChannelDeleted,
  ChannelInvited,
  ChannelJoined,
  ChannelLeft,
  ChannelModeratorDemoted,
  ChannelModeratorPromoted,
  ChannelUninvited,
} from "./events";

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
    if (!input || typeof input !== "object") {
      return "Invalid channel input";
    }

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

    const moderators = createUnorderedMap<UserId, Username>();
    moderators.set(executorId, executorUsername);

    const members = createUnorderedMap<UserId, Username>();
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
    emit(new ChannelCreated(normalizedId, executorId, type));
    return "Channel created";
  }

  addUserToChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
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
    this.state.channels.set(normalizedId, channel);
    emit(new ChannelInvited(normalizedId, executorId, input.userId));
    return "Member added to channel";
  }

  removeUserFromChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
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
    this.state.channels.set(normalizedId, channel);
    emit(new ChannelUninvited(normalizedId, executorId, input.userId));
    return "Member removed from channel";
  }

  promoteModerator(input: ModeratorInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
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
    this.state.channels.set(normalizedId, channel);
    emit(new ChannelModeratorPromoted(normalizedId, executorId, input.userId));
    return "Moderator added";
  }

  demoteModerator(input: ModeratorInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
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
    this.state.channels.set(normalizedId, channel);
    emit(new ChannelModeratorDemoted(normalizedId, executorId, input.userId));
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
    emit(new ChannelDeleted(normalizedId, executorId));
    return "Channel deleted";
  }

  joinPublicChannel(channelId: ChannelId, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const channel = this.state.channels.get(normalizedId);
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

    // Modify the nested CRDT - changes persist automatically
    // No need to re-set the channel, nested CRDT changes are persisted directly
    channel.members.set(executorId, username);
    emit(new ChannelJoined(normalizedId, executorId));
    return "Joined channel";
  }

  leaveChannel(channelId: ChannelId, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }

    if (channel.type === ChannelType.Default) {
      return "Cannot leave default channels";
    }

    if (!channel.members.has(executorId)) {
      return "User is not a member of the channel";
    }

    // Modify the nested CRDTs - changes persist automatically
    // No need to re-set the channel, nested CRDT changes are persisted directly
    channel.members.remove(executorId);
    channel.moderators.remove(executorId);
    emit(new ChannelLeft(normalizedId, executorId));
    return "Left channel";
  }

  addUserToDefaultChannels(userId: UserId, username: Username): void {
    this.state.channels.entries().forEach(([channelId, metadata]) => {
      if (metadata.type !== ChannelType.Default || metadata.members.has(userId)) {
        return;
      }
      metadata.members.set(userId, username);
      this.state.channels.set(channelId, metadata);
    });
  }

  private normalizeChannelId(channelId: ChannelId): ChannelId {
    return channelId.trim().toLowerCase();
  }

  private formatChannelResponse(channelId: ChannelId, metadata: ChannelMetadata): ChannelMetadataResponse {
    // Ensure nested maps are properly hydrated by using their IDs
    // This ensures we're working with the actual CRDT instances
    const membersId = metadata.members.id();
    const moderatorsId = metadata.moderators.id();
    
    const members = UnorderedMap.fromId<UserId, Username>(membersId);
    const moderators = UnorderedMap.fromId<UserId, Username>(moderatorsId);
    
    return {
      channelId,
      type: metadata.type,
      createdAt: metadata.createdAt.toString(),
      createdBy: metadata.createdBy,
      createdByUsername: metadata.createdByUsername,
      readOnly: metadata.readOnly,
      moderators: this.formatMembership(moderators),
      members: this.formatMembership(members),
    };
  }

  private formatMembership(map: UnorderedMap<UserId, Username>): ChannelMembershipEntry[] {
    return map.entries().map(([userId, username]) => ({
      publicKey: userId,
      username,
    }));
  }
}

