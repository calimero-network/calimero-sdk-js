import { emit, env, createVector } from "@calimero/sdk";
import { UnorderedMap, Vector } from "@calimero/sdk/collections";

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
  channelMembers: UnorderedMap<ChannelId, Vector<UserId>>;
  channelModerators: UnorderedMap<ChannelId, Vector<UserId>>;
}

export class ChannelManager {
  constructor(private readonly state: ChannelState) {}

  private getOrCreateMembersVector(channelId: ChannelId): Vector<UserId> {
    let members = this.state.channelMembers.get(channelId);
    if (!members) {
      members = createVector<UserId>();
      this.state.channelMembers.set(channelId, members);
    }
    return members;
  }

  private getOrCreateModeratorsVector(channelId: ChannelId): Vector<UserId> {
    let moderators = this.state.channelModerators.get(channelId);
    if (!moderators) {
      moderators = createVector<UserId>();
      this.state.channelModerators.set(channelId, moderators);
    }
    return moderators;
  }

  private getChannelMembers(channelId: ChannelId): UserId[] {
    const members = this.state.channelMembers.get(channelId);
    return members ? members.toArray() : [];
  }

  private getChannelModerators(channelId: ChannelId): UserId[] {
    const moderators = this.state.channelModerators.get(channelId);
    return moderators ? moderators.toArray() : [];
  }

  private isChannelMember(channelId: ChannelId, userId: UserId): boolean {
    const members = this.state.channelMembers.get(channelId);
    if (!members) {
      return false;
    }
    return members.toArray().includes(userId);
  }

  private isChannelModerator(channelId: ChannelId, userId: UserId): boolean {
    const moderators = this.state.channelModerators.get(channelId);
    if (!moderators) {
      return false;
    }
    return moderators.toArray().includes(userId);
  }

  private addToVector(vector: Vector<UserId>, userId: UserId): void {
    if (!vector.toArray().includes(userId)) {
      vector.push(userId);
    }
  }

  private removeFromVector(vector: Vector<UserId>, userId: UserId): void {
    const items = vector.toArray();
    const newVector = createVector<UserId>();
    for (const item of items) {
      if (item !== userId) {
        newVector.push(item);
      }
    }
    // Replace the vector
    while (vector.pop()) {
      // Clear existing vector
    }
    for (const item of newVector.toArray()) {
      vector.push(item);
    }
  }

  listForMember(userId: UserId): ChannelMetadataResponse[] {
    const channels: ChannelMetadataResponse[] = [];

    this.state.channels.entries().forEach(([channelId, metadata]) => {
      if (this.isChannelMember(channelId, userId)) {
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
      
      if (this.isChannelMember(channelId, userId)) {
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

    const metadata: ChannelMetadata = {
      type,
      createdAt: env.timeNow(),
      createdBy: executorId,
      createdByUsername: executorUsername,
      readOnly: input.readOnly ?? false,
    };

    this.state.channels.set(normalizedId, metadata);
    
    // Add creator as member and moderator
    const members = createVector<UserId>();
    members.push(executorId);
    this.state.channelMembers.set(normalizedId, members);
    
    const moderators = createVector<UserId>();
    moderators.push(executorId);
    this.state.channelModerators.set(normalizedId, moderators);
    
    emit(new ChannelCreated(normalizedId, executorId, type));
    return "Channel created";
  }

  addUserToChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return "Only moderators can add members to the channel";
    }

    if (this.isChannelMember(normalizedId, input.userId)) {
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

    const members = this.getOrCreateMembersVector(normalizedId);
    this.addToVector(members, input.userId);
    this.state.channelMembers.set(normalizedId, members);
    emit(new ChannelInvited(normalizedId, executorId, input.userId));
    return "Member added to channel";
  }

  removeUserFromChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return "Only moderators can remove members from the channel";
    }

    if (!this.isChannelMember(normalizedId, input.userId)) {
      return "User is not a member of the channel";
    }

    const members = this.getOrCreateMembersVector(normalizedId);
    const moderators = this.getOrCreateModeratorsVector(normalizedId);
    this.removeFromVector(members, input.userId);
    this.removeFromVector(moderators, input.userId);
    this.state.channelMembers.set(normalizedId, members);
    this.state.channelModerators.set(normalizedId, moderators);
    emit(new ChannelUninvited(normalizedId, executorId, input.userId));
    return "Member removed from channel";
  }

  promoteModerator(input: ModeratorInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return "Only moderators can promote other members";
    }

    if (!this.isChannelMember(normalizedId, input.userId)) {
      return "User must be a member of the channel";
    }

    const username = this.state.members.get(input.userId);
    if (!username) {
      return "User must join the chat first";
    }

    const moderators = this.getOrCreateModeratorsVector(normalizedId);
    this.addToVector(moderators, input.userId);
    this.state.channelModerators.set(normalizedId, moderators);
    emit(new ChannelModeratorPromoted(normalizedId, executorId, input.userId));
    return "Moderator added";
  }

  demoteModerator(input: ModeratorInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return "Channel not found";
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return "Only moderators can demote moderators";
    }

    if (!this.isChannelModerator(normalizedId, input.userId)) {
      return "User is not a moderator";
    }

    const moderators = this.getOrCreateModeratorsVector(normalizedId);
    this.removeFromVector(moderators, input.userId);
    this.state.channelModerators.set(normalizedId, moderators);
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

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return "Only moderators can delete a channel";
    }

    this.state.channels.remove(normalizedId);
    this.state.channelMembers.remove(normalizedId);
    this.state.channelModerators.remove(normalizedId);
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

    if (this.isChannelMember(normalizedId, executorId)) {
      return "Already a member of the channel";
    }

    const username = this.state.members.get(executorId);
    if (!username) {
      return "Join the chat before joining channels";
    }

    const members = this.getOrCreateMembersVector(normalizedId);
    this.addToVector(members, executorId);
    this.state.channelMembers.set(normalizedId, members);
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

    if (!this.isChannelMember(normalizedId, executorId)) {
      return "User is not a member of the channel";
    }

    const members = this.getOrCreateMembersVector(normalizedId);
    const moderators = this.getOrCreateModeratorsVector(normalizedId);
    this.removeFromVector(members, executorId);
    this.removeFromVector(moderators, executorId);
    this.state.channelMembers.set(normalizedId, members);
    this.state.channelModerators.set(normalizedId, moderators);
    emit(new ChannelLeft(normalizedId, executorId));
    return "Left channel";
  }

  addUserToDefaultChannels(userId: UserId, _username: Username): void {
    this.state.channels.entries().forEach(([channelId, metadata]) => {
      if (metadata.type !== ChannelType.Default) {
        return;
      }

      if (this.isChannelMember(channelId, userId)) {
        return;
      }

      const members = this.getOrCreateMembersVector(channelId);
      this.addToVector(members, userId);
      this.state.channelMembers.set(channelId, members);
    });
  }

  private normalizeChannelId(channelId: ChannelId): ChannelId {
    return channelId.trim().toLowerCase();
  }

  private formatChannelResponse(channelId: ChannelId, metadata: ChannelMetadata): ChannelMetadataResponse {
    // Get member and moderator user IDs from Vectors
    const memberIds = this.getChannelMembers(channelId);
    const moderatorIds = this.getChannelModerators(channelId);
    
    // Fetch usernames from this.members and combine
    const members: ChannelMembershipEntry[] = memberIds
      .map(userId => {
        const username = this.state.members.get(userId);
        return username ? { publicKey: userId, username } : null;
      })
      .filter((entry): entry is ChannelMembershipEntry => entry !== null);

    const moderators: ChannelMembershipEntry[] = moderatorIds
      .map(userId => {
        const username = this.state.members.get(userId);
        return username ? { publicKey: userId, username } : null;
      })
      .filter((entry): entry is ChannelMembershipEntry => entry !== null);
    
    return {
      channelId,
      type: metadata.type,
      createdAt: metadata.createdAt.toString(),
      createdBy: metadata.createdBy,
      createdByUsername: metadata.createdByUsername,
      readOnly: metadata.readOnly,
      moderators,
      members,
    };
  }
}
