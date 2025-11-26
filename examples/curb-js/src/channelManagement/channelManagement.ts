import { emit, env, createVector, createLwwRegister } from '@calimero/sdk';
import { UnorderedMap, Vector, LwwRegister } from '@calimero/sdk/collections';

import { isUsernameTaken } from '../utils/members';
import type { ChannelId, UserId, Username } from '../types';
import {
  ChannelType,
  type ChannelDirectoryResponse,
  type ChannelMembershipEntry,
  type ChannelMembershipInput,
  type ChannelMetadata,
  type ChannelMetadataResponse,
  type CreateChannelInput,
  type ModeratorInput,
} from './types';
import {
  ChannelCreated,
  ChannelDeleted,
  ChannelInvited,
  ChannelJoined,
  ChannelLeft,
  ChannelModeratorDemoted,
  ChannelModeratorPromoted,
  ChannelUninvited,
} from './events';

export interface ChannelState {
  owner: UserId;
  members: UnorderedMap<UserId, Username>;
  channels: UnorderedMap<ChannelId, ChannelMetadata>;
  channelMembers: UnorderedMap<ChannelId, LwwRegister<Vector<UserId>>>;
  channelModerators: UnorderedMap<ChannelId, LwwRegister<Vector<UserId>>>;
}

export class ChannelManager {
  constructor(private readonly state: ChannelState) {}

  private getOrCreateMembersRegister(channelId: ChannelId): LwwRegister<Vector<UserId>> {
    let register = this.state.channelMembers.get(channelId);
    if (!register) {
      const vector = createVector<UserId>();
      register = createLwwRegister<Vector<UserId>>({ initialValue: vector });
      this.state.channelMembers.set(channelId, register);
    }
    return register;
  }

  private getOrCreateModeratorsRegister(channelId: ChannelId): LwwRegister<Vector<UserId>> {
    let register = this.state.channelModerators.get(channelId);
    if (!register) {
      const vector = createVector<UserId>();
      register = createLwwRegister<Vector<UserId>>({ initialValue: vector });
      this.state.channelModerators.set(channelId, register);
    }
    return register;
  }

  private getMembersVector(channelId: ChannelId): Vector<UserId> | null {
    const register = this.state.channelMembers.get(channelId);
    if (!register) {
      return null;
    }
    try {
      return register.get();
    } catch {
      return null;
    }
  }

  private getModeratorsVector(channelId: ChannelId): Vector<UserId> | null {
    const register = this.state.channelModerators.get(channelId);
    if (!register) {
      return null;
    }
    try {
      return register.get();
    } catch {
      return null;
    }
  }

  private getChannelMembers(channelId: ChannelId): UserId[] {
    const vector = this.getMembersVector(channelId);
    if (!vector) {
      return [];
    }
    try {
      return vector.toArray();
    } catch {
      // Vector might not be hydrated yet, return empty array
      return [];
    }
  }

  private getChannelModerators(channelId: ChannelId): UserId[] {
    const vector = this.getModeratorsVector(channelId);
    if (!vector) {
      return [];
    }
    try {
      return vector.toArray();
    } catch {
      // Vector might not be hydrated yet, return empty array
      return [];
    }
  }

  private isChannelMember(channelId: ChannelId, userId: UserId): boolean {
    const vector = this.getMembersVector(channelId);
    if (!vector) {
      return false;
    }
    try {
      return vector.toArray().includes(userId);
    } catch {
      // Vector might not be hydrated yet, return false
      return false;
    }
  }

  private isChannelModerator(channelId: ChannelId, userId: UserId): boolean {
    const vector = this.getModeratorsVector(channelId);
    if (!vector) {
      return false;
    }
    try {
      return vector.toArray().includes(userId);
    } catch {
      // Vector might not be hydrated yet, return false
      return false;
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

  createChannel(
    input: CreateChannelInput,
    executorId: UserId,
    executorUsername: Username | undefined
  ): string {
    if (!input || typeof input !== 'object') {
      return 'Invalid channel input';
    }

    const name = input.name?.trim();
    if (!name) {
      return 'Channel name cannot be empty';
    }

    if (!executorUsername) {
      return 'Executor must join the chat before creating channels';
    }

    const normalizedId = this.normalizeChannelId(name);
    if (this.state.channels.has(normalizedId)) {
      return 'Channel already exists';
    }

    const type = input.type ?? ChannelType.Public;
    if (type === ChannelType.Default) {
      return 'Default channels can only be created during initialization';
    }

    if (type !== ChannelType.Public && type !== ChannelType.Private) {
      return 'Channel type must be public or private';
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
    const membersVector = createVector<UserId>();
    membersVector.push(executorId);
    const membersRegister = createLwwRegister<Vector<UserId>>({ initialValue: membersVector });
    this.state.channelMembers.set(normalizedId, membersRegister);

    const moderatorsVector = createVector<UserId>();
    moderatorsVector.push(executorId);
    const moderatorsRegister = createLwwRegister<Vector<UserId>>({
      initialValue: moderatorsVector,
    });
    this.state.channelModerators.set(normalizedId, moderatorsRegister);

    emit(new ChannelCreated(normalizedId, executorId, type));
    return 'Channel created';
  }

  addUserToChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return 'Only moderators can add members to the channel';
    }

    if (this.isChannelMember(normalizedId, input.userId)) {
      return 'User is already a member of the channel';
    }

    let username = this.state.members.get(input.userId);
    if (!username) {
      const provided = input.username?.trim();
      if (!provided) {
        return 'Username is required for new members';
      }
      if (isUsernameTaken(this.state.members, provided)) {
        return 'Username is already taken';
      }
      this.state.members.set(input.userId, provided);
      username = provided;
    }

    const register = this.getOrCreateMembersRegister(normalizedId);
    const currentVector = register.get() ?? createVector<UserId>();
    const newVector = createVector<UserId>();
    // Copy existing members
    for (const userId of currentVector.toArray()) {
      newVector.push(userId);
    }
    // Add new member if not already present
    if (!currentVector.toArray().includes(input.userId)) {
      newVector.push(input.userId);
    }
    register.set(newVector);
    emit(new ChannelInvited(normalizedId, executorId, input.userId));
    return 'Member added to channel';
  }

  removeUserFromChannel(input: ChannelMembershipInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return 'Only moderators can remove members from the channel';
    }

    if (!this.isChannelMember(normalizedId, input.userId)) {
      return 'User is not a member of the channel';
    }

    const membersRegister = this.getOrCreateMembersRegister(normalizedId);
    const moderatorsRegister = this.getOrCreateModeratorsRegister(normalizedId);

    // Create new vectors without the removed user
    const currentMembers = membersRegister.get() ?? createVector<UserId>();
    const newMembers = createVector<UserId>();
    for (const userId of currentMembers.toArray()) {
      if (userId !== input.userId) {
        newMembers.push(userId);
      }
    }
    membersRegister.set(newMembers);

    const currentModerators = moderatorsRegister.get() ?? createVector<UserId>();
    const newModerators = createVector<UserId>();
    for (const userId of currentModerators.toArray()) {
      if (userId !== input.userId) {
        newModerators.push(userId);
      }
    }
    moderatorsRegister.set(newModerators);

    emit(new ChannelUninvited(normalizedId, executorId, input.userId));
    return 'Member removed from channel';
  }

  promoteModerator(input: ModeratorInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return 'Only moderators can promote other members';
    }

    if (!this.isChannelMember(normalizedId, input.userId)) {
      return 'User must be a member of the channel';
    }

    const username = this.state.members.get(input.userId);
    if (!username) {
      return 'User must join the chat first';
    }

    const register = this.getOrCreateModeratorsRegister(normalizedId);
    const currentVector = register.get() ?? createVector<UserId>();
    const newVector = createVector<UserId>();
    // Copy existing moderators
    for (const userId of currentVector.toArray()) {
      newVector.push(userId);
    }
    // Add new moderator if not already present
    if (!currentVector.toArray().includes(input.userId)) {
      newVector.push(input.userId);
    }
    register.set(newVector);
    emit(new ChannelModeratorPromoted(normalizedId, executorId, input.userId));
    return 'Moderator added';
  }

  demoteModerator(input: ModeratorInput, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(input.channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return 'Only moderators can demote moderators';
    }

    if (!this.isChannelModerator(normalizedId, input.userId)) {
      return 'User is not a moderator';
    }

    const register = this.getOrCreateModeratorsRegister(normalizedId);
    const currentVector = register.get() ?? createVector<UserId>();
    const newVector = createVector<UserId>();
    // Copy moderators except the removed one
    for (const userId of currentVector.toArray()) {
      if (userId !== input.userId) {
        newVector.push(userId);
      }
    }
    register.set(newVector);
    emit(new ChannelModeratorDemoted(normalizedId, executorId, input.userId));
    return 'Moderator removed';
  }

  deleteChannel(channelId: ChannelId, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (channel.type === ChannelType.Default) {
      return 'Default channels cannot be deleted';
    }

    if (!this.isChannelModerator(normalizedId, executorId)) {
      return 'Only moderators can delete a channel';
    }

    this.state.channels.remove(normalizedId);
    this.state.channelMembers.remove(normalizedId);
    this.state.channelModerators.remove(normalizedId);
    emit(new ChannelDeleted(normalizedId, executorId));
    return 'Channel deleted';
  }

  joinPublicChannel(channelId: ChannelId, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (channel.type !== ChannelType.Public) {
      return 'Channel is not public';
    }

    if (this.isChannelMember(normalizedId, executorId)) {
      return 'Already a member of the channel';
    }

    const username = this.state.members.get(executorId);
    if (!username) {
      return 'Join the chat before joining channels';
    }

    const register = this.getOrCreateMembersRegister(normalizedId);
    const currentVector = register.get() ?? createVector<UserId>();
    const newVector = createVector<UserId>();
    // Copy existing members
    for (const userId of currentVector.toArray()) {
      newVector.push(userId);
    }
    // Add new member if not already present
    if (!currentVector.toArray().includes(executorId)) {
      newVector.push(executorId);
    }
    register.set(newVector);
    emit(new ChannelJoined(normalizedId, executorId));
    return 'Joined channel';
  }

  leaveChannel(channelId: ChannelId, executorId: UserId): string {
    const normalizedId = this.normalizeChannelId(channelId);
    const channel = this.state.channels.get(normalizedId);
    if (!channel) {
      return 'Channel not found';
    }

    if (channel.type === ChannelType.Default) {
      return 'Cannot leave default channels';
    }

    if (!this.isChannelMember(normalizedId, executorId)) {
      return 'User is not a member of the channel';
    }

    const membersRegister = this.getOrCreateMembersRegister(normalizedId);
    const moderatorsRegister = this.getOrCreateModeratorsRegister(normalizedId);

    // Create new members vector without the leaving user
    const currentMembers = membersRegister.get() ?? createVector<UserId>();
    const newMembers = createVector<UserId>();
    for (const userId of currentMembers.toArray()) {
      if (userId !== executorId) {
        newMembers.push(userId);
      }
    }
    membersRegister.set(newMembers);

    // Create new moderators vector without the leaving user
    const currentModerators = moderatorsRegister.get() ?? createVector<UserId>();
    const newModerators = createVector<UserId>();
    for (const userId of currentModerators.toArray()) {
      if (userId !== executorId) {
        newModerators.push(userId);
      }
    }
    moderatorsRegister.set(newModerators);

    emit(new ChannelLeft(normalizedId, executorId));
    return 'Left channel';
  }

  addUserToDefaultChannels(userId: UserId, _username: Username): void {
    this.state.channels.entries().forEach(([channelId, metadata]) => {
      if (metadata.type !== ChannelType.Default) {
        return;
      }

      // Check if already a member, but handle case where Vector might not be hydrated
      try {
        if (this.isChannelMember(channelId, userId)) {
          return;
        }
      } catch {
        // If check fails, continue to add user
      }

      // Ensure Register exists and add user
      const register = this.getOrCreateMembersRegister(channelId);
      const currentVector = register.get() ?? createVector<UserId>();
      const newVector = createVector<UserId>();
      // Copy existing members
      for (const userId of currentVector.toArray()) {
        newVector.push(userId);
      }
      // Add new member if not already present
      if (!currentVector.toArray().includes(userId)) {
        newVector.push(userId);
      }
      register.set(newVector);
    });
  }

  private normalizeChannelId(channelId: ChannelId): ChannelId {
    return channelId.trim().toLowerCase();
  }

  private formatChannelResponse(
    channelId: ChannelId,
    metadata: ChannelMetadata
  ): ChannelMetadataResponse {
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
