import {
  emit,
  env,
  createVector,
  createLwwRegister,
  createUnorderedMap,
  createUnorderedSet,
} from '@calimero-network/calimero-sdk-js';
import { UnorderedMap, UnorderedSet, Vector, LwwRegister } from '@calimero-network/calimero-sdk-js/collections';

import { isUsernameTaken } from '../utils/members';
import type { ChannelId, UserId, Username } from '../types';
import type { StoredMessage } from '../messageManagement/types';
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
  channelReadPositions: UnorderedMap<ChannelId, UnorderedMap<UserId, LwwRegister<bigint>>>;
}

export class ChannelManager {
  constructor(private readonly state: ChannelState) {}

  private getOrCreateMembersRegister(channelId: ChannelId): LwwRegister<UnorderedSet<UserId>> {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }
    return channel.channelMembers;
  }

  private getOrCreateModeratorsRegister(channelId: ChannelId): LwwRegister<UnorderedSet<UserId>> {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }
    return channel.channelModerators;
  }

  private getMembersSet(channelId: ChannelId): UnorderedSet<UserId> | null {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return null;
    }
    try {
      return channel.channelMembers.get();
    } catch {
      return null;
    }
  }

  private getModeratorsSet(channelId: ChannelId): UnorderedSet<UserId> | null {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      return null;
    }
    try {
      return channel.channelModerators.get();
    } catch {
      return null;
    }
  }

  private getChannelMembers(channelId: ChannelId): UserId[] {
    const set = this.getMembersSet(channelId);
    if (!set) {
      return [];
    }
    try {
      return set.toArray();
    } catch {
      // Set might not be hydrated yet, return empty array
      return [];
    }
  }

  private getChannelModerators(channelId: ChannelId): UserId[] {
    const set = this.getModeratorsSet(channelId);
    if (!set) {
      return [];
    }
    try {
      return set.toArray();
    } catch {
      // Set might not be hydrated yet, return empty array
      return [];
    }
  }

  private isChannelMember(channelId: ChannelId, userId: UserId): boolean {
    const set = this.getMembersSet(channelId);
    if (!set) {
      return false;
    }
    try {
      return set.has(userId);
    } catch {
      // Set might not be hydrated yet, return false
      return false;
    }
  }

  private isChannelModerator(channelId: ChannelId, userId: UserId): boolean {
    const set = this.getModeratorsSet(channelId);
    if (!set) {
      return false;
    }
    try {
      return set.has(userId);
    } catch {
      // Set might not be hydrated yet, return false
      return false;
    }
  }

  listForMember(userId: UserId): ChannelMetadataResponse[] {
    const channels: ChannelMetadataResponse[] = [];

    this.state.channels.entries().forEach(([channelId, metadata]) => {
      if (this.isChannelMember(channelId, userId)) {
        channels.push(this.formatChannelResponse(channelId, metadata, userId));
      }
    });

    return channels;
  }

  listDirectory(userId: UserId): ChannelDirectoryResponse {
    const joined: ChannelMetadataResponse[] = [];
    const availablePublic: ChannelMetadataResponse[] = [];

    this.state.channels.entries().forEach(([channelId, metadata]) => {
      const formatted = this.formatChannelResponse(channelId, metadata, userId);

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

    // Add creator as member and moderator
    const membersSet = createUnorderedSet<UserId>();
    membersSet.add(executorId);
    const membersRegister = createLwwRegister<UnorderedSet<UserId>>({ initialValue: membersSet });

    const moderatorsSet = createUnorderedSet<UserId>();
    moderatorsSet.add(executorId);
    const moderatorsRegister = createLwwRegister<UnorderedSet<UserId>>({
      initialValue: moderatorsSet,
    });

    // Initialize channel messages, thread messages, and reactions
    const channelMessagesVector = createVector<StoredMessage>();
    const channelMessagesRegister = createLwwRegister<Vector<StoredMessage>>({
      initialValue: channelMessagesVector,
    });
    const threadMessages = createUnorderedMap<string, LwwRegister<Vector<StoredMessage>>>();
    const messageReactions = createUnorderedMap<
      string,
      UnorderedMap<string, UnorderedSet<UserId>>
    >();

    const metadata: ChannelMetadata = {
      type,
      createdAt: env.timeNow(),
      createdBy: executorId,
      createdByUsername: executorUsername,
      readOnly: input.readOnly ?? false,
      channelMembers: membersRegister,
      channelModerators: moderatorsRegister,
      channelMessages: channelMessagesRegister,
      threadMessages: threadMessages,
      messageReactions: messageReactions,
    };

    this.state.channels.set(normalizedId, metadata);

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

    const membersRegister = this.getOrCreateMembersRegister(normalizedId);
    const currentSet = membersRegister.get() ?? createUnorderedSet<UserId>();
    const newSet = createUnorderedSet<UserId>();
    try {
      for (const userId of currentSet.toArray()) {
        newSet.add(userId);
      }
    } catch {
      // Set might not be hydrated yet
    }
    newSet.add(input.userId);
    membersRegister.set(newSet);

    // If the user being added is the channel owner, add them to moderators
    if (input.userId === channel.createdBy) {
      const moderatorsRegister = this.getOrCreateModeratorsRegister(normalizedId);
      const currentModeratorsSet = moderatorsRegister.get() ?? createUnorderedSet<UserId>();
      const newModeratorsSet = createUnorderedSet<UserId>();
      try {
        for (const userId of currentModeratorsSet.toArray()) {
          newModeratorsSet.add(userId);
        }
      } catch {
        // Set might not be hydrated yet
      }
      newModeratorsSet.add(input.userId);
      moderatorsRegister.set(newModeratorsSet);
    }

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

    // Create new sets without the removed user
    const currentMembers = membersRegister.get() ?? createUnorderedSet<UserId>();
    const newMembers = createUnorderedSet<UserId>();
    try {
      for (const userId of currentMembers.toArray()) {
        if (userId !== input.userId) {
          newMembers.add(userId);
        }
      }
    } catch {
      // Set might not be hydrated yet
    }
    membersRegister.set(newMembers);

    const currentModerators = moderatorsRegister.get() ?? createUnorderedSet<UserId>();
    const newModerators = createUnorderedSet<UserId>();
    try {
      for (const userId of currentModerators.toArray()) {
        if (userId !== input.userId) {
          newModerators.add(userId);
        }
      }
    } catch {
      // Set might not be hydrated yet
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

    const moderatorsRegister = this.getOrCreateModeratorsRegister(normalizedId);
    const currentSet = moderatorsRegister.get() ?? createUnorderedSet<UserId>();
    const newSet = createUnorderedSet<UserId>();
    try {
      for (const userId of currentSet.toArray()) {
        newSet.add(userId);
      }
    } catch {
      // Set might not be hydrated yet
    }
    newSet.add(input.userId);
    moderatorsRegister.set(newSet);
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

    const moderatorsRegister = this.getOrCreateModeratorsRegister(normalizedId);
    const currentSet = moderatorsRegister.get() ?? createUnorderedSet<UserId>();
    const newSet = createUnorderedSet<UserId>();
    try {
      for (const userId of currentSet.toArray()) {
        if (userId !== input.userId) {
          newSet.add(userId);
        }
      }
    } catch {
      // Set might not be hydrated yet
    }
    moderatorsRegister.set(newSet);
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

    const membersRegister = this.getOrCreateMembersRegister(normalizedId);
    const currentSet = membersRegister.get() ?? createUnorderedSet<UserId>();
    const newSet = createUnorderedSet<UserId>();
    try {
      for (const userId of currentSet.toArray()) {
        newSet.add(userId);
      }
    } catch {
      // Set might not be hydrated yet
    }
    newSet.add(executorId);
    membersRegister.set(newSet);

    // If the user joining is the channel owner, add them to moderators
    if (executorId === channel.createdBy) {
      const moderatorsRegister = this.getOrCreateModeratorsRegister(normalizedId);
      const currentModeratorsSet = moderatorsRegister.get() ?? createUnorderedSet<UserId>();
      const newModeratorsSet = createUnorderedSet<UserId>();
      try {
        for (const userId of currentModeratorsSet.toArray()) {
          newModeratorsSet.add(userId);
        }
      } catch {
        // Set might not be hydrated yet
      }
      newModeratorsSet.add(executorId);
      moderatorsRegister.set(newModeratorsSet);
    }

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

    // Create new sets without the leaving user
    const currentMembers = membersRegister.get() ?? createUnorderedSet<UserId>();
    const newMembers = createUnorderedSet<UserId>();
    try {
      for (const userId of currentMembers.toArray()) {
        if (userId !== executorId) {
          newMembers.add(userId);
        }
      }
    } catch {
      // Set might not be hydrated yet
    }
    membersRegister.set(newMembers);

    const currentModerators = moderatorsRegister.get() ?? createUnorderedSet<UserId>();
    const newModerators = createUnorderedSet<UserId>();
    try {
      for (const userId of currentModerators.toArray()) {
        if (userId !== executorId) {
          newModerators.add(userId);
        }
      }
    } catch {
      // Set might not be hydrated yet
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

      // Check if already a member, but handle case where Set might not be hydrated
      try {
        if (this.isChannelMember(channelId, userId)) {
          return;
        }
      } catch {
        // If check fails, continue to add user
      }

      // Add user to members set
      const membersRegister = this.getOrCreateMembersRegister(channelId);
      const currentSet = membersRegister.get() ?? createUnorderedSet<UserId>();
      const newSet = createUnorderedSet<UserId>();
      try {
        for (const userId of currentSet.toArray()) {
          newSet.add(userId);
        }
      } catch {
        // Set might not be hydrated yet
      }
      newSet.add(userId);
      membersRegister.set(newSet);
    });
  }

  private normalizeChannelId(channelId: ChannelId): ChannelId {
    return channelId.trim().toLowerCase();
  }

  private formatChannelResponse(
    channelId: ChannelId,
    metadata: ChannelMetadata,
    userId: UserId
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

    // Calculate unread messages
    const unreadMessages = this.calculateUnreadMessages(channelId, userId, metadata);

    return {
      channelId,
      type: metadata.type,
      createdAt: metadata.createdAt.toString(),
      createdBy: metadata.createdBy,
      createdByUsername: metadata.createdByUsername,
      readOnly: metadata.readOnly,
      moderators,
      members,
      unreadMessages,
    };
  }

  private calculateUnreadMessages(
    channelId: ChannelId,
    userId: UserId,
    metadata: ChannelMetadata
  ): { count: number; mentions: number } {
    // Get last read timestamp for this user in this channel
    let lastReadTimestamp = 0n;
    const userReadMap = this.state.channelReadPositions.get(channelId);
    if (userReadMap) {
      const readRegister = userReadMap.get(userId);
      if (readRegister) {
        try {
          lastReadTimestamp = readRegister.get() ?? 0n;
        } catch {
          // Register might not be hydrated yet
        }
      }
    }

    // Get all messages from the channel
    const messagesRegister = metadata.channelMessages;
    if (!messagesRegister) {
      return { count: 0, mentions: 0 };
    }

    let allMessages: StoredMessage[] = [];
    try {
      const vector = messagesRegister.get();
      if (vector) {
        allMessages = vector.toArray();
      }
    } catch {
      // Vector might not be hydrated yet
      return { count: 0, mentions: 0 };
    }

    // Count unread messages (messages after lastReadTimestamp that are not deleted)
    let unreadCount = 0;
    let mentionCount = 0;

    for (const message of allMessages) {
      // Only count non-deleted messages
      if (message.deleted) {
        continue;
      }

      // Check if message is unread
      if (message.timestamp > lastReadTimestamp) {
        unreadCount++;

        // Check if user is mentioned in this message
        let isMentioned = false;

        // Check direct user ID mentions
        if (message.mentions && message.mentions.includes(userId)) {
          isMentioned = true;
        }

        // Check for @here and @everyone mentions (these notify all channel members)
        if (message.mentionUsernames && message.mentionUsernames.length > 0) {
          const hasHere = message.mentionUsernames.some(
            u => u.toLowerCase() === 'here' || u.toLowerCase() === '@here'
          );
          const hasEveryone = message.mentionUsernames.some(
            u => u.toLowerCase() === 'everyone' || u.toLowerCase() === '@everyone'
          );

          if (hasHere || hasEveryone) {
            // User is a member of the channel (we're already in listForMember), so they're mentioned
            isMentioned = true;
          }
        }

        if (isMentioned) {
          mentionCount++;
        }
      }
    }

    return {
      count: unreadCount,
      mentions: mentionCount,
    };
  }
}
