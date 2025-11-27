import { emit, createVector, createUnorderedMap, createLwwRegister } from '@calimero/sdk';
import { UnorderedMap, Vector, LwwRegister } from '@calimero/sdk/collections';

import { ChannelType } from '../channelManagement/types';
import type { UserId } from '../types';
import type { CreateDMChatArgs, DeleteDMArgs, DMChatInfo, UpdateIdentityArgs } from './types';
import { DMCreated, NewIdentityUpdated, DMDeleted } from './events';

export class DmManagement {
  constructor(
    private readonly dmChats: UnorderedMap<UserId, Vector<DMChatInfo>>,
    private readonly dmReadHashes: UnorderedMap<string, UnorderedMap<UserId, LwwRegister<string>>>
  ) {}

  getDMs(executorId: UserId): DMChatInfo[] {
    const vector = this.dmChats.get(executorId);
    return vector ? vector.toArray() : [];
  }

  createDMChat(
    executorId: UserId,
    args: CreateDMChatArgs,
    usernames: Record<UserId, string>
  ): string {
    const {
      contextId,
      creator,
      creatorNewIdentity,
      invitee,
      timestamp,
      contextHash,
      invitationPayload,
    } = args;

    if (executorId !== creator) {
      return 'You are not the inviter';
    }

    const ownUsername = usernames[creator];
    const otherUsername = usernames[invitee];
    if (!ownUsername || !otherUsername) {
      return 'Usernames not found';
    }

    if (ownUsername === otherUsername) {
      return 'You cannot invite yourself';
    }

    // Check if DM already exists between these users
    const creatorDms = this.getDMs(creator);
    const inviteeDms = this.getDMs(invitee);

    // Check if creator already has a DM with invitee
    const creatorHasDM = creatorDms.some(
      dm => dm.otherIdentityOld === invitee || dm.otherIdentityNew === invitee
    );

    // Check if invitee already has a DM with creator
    const inviteeHasDM = inviteeDms.some(
      dm => dm.otherIdentityOld === creator || dm.otherIdentityNew === creator
    );

    // Check if contextId already exists
    const contextIdExists =
      creatorDms.some(dm => dm.contextId === contextId) ||
      inviteeDms.some(dm => dm.contextId === contextId);

    if (creatorHasDM || inviteeHasDM || contextIdExists) {
      return 'DM already exists between these users';
    }

    const creatorChat: DMChatInfo = {
      contextId,
      channelType: ChannelType.Private,
      createdAt: timestamp,
      createdBy: creator,
      ownIdentityOld: creator,
      ownIdentity: creatorNewIdentity,
      ownUsername,
      otherIdentityOld: invitee,
      otherIdentityNew: undefined,
      otherUsername,
      didJoin: true,
      invitationPayload,
      oldHash: contextHash,
      newHash: contextHash,
      unreadMessages: 0,
    };

    const inviteeChat: DMChatInfo = {
      contextId,
      channelType: ChannelType.Private,
      createdAt: timestamp,
      createdBy: creator,
      ownIdentityOld: invitee,
      ownIdentity: undefined,
      ownUsername: otherUsername,
      otherIdentityOld: creator,
      otherIdentityNew: creatorNewIdentity,
      otherUsername: ownUsername,
      didJoin: false,
      invitationPayload,
      oldHash: contextHash,
      newHash: contextHash,
      unreadMessages: 0,
    };

    this.addDmToUser(creator, creatorChat);
    this.addDmToUser(invitee, inviteeChat);

    emit(new DMCreated(contextId));
    return contextId;
  }

  updateNewIdentity(executorId: UserId, args: UpdateIdentityArgs): string {
    const { otherUser, newIdentity } = args;

    const executorDms = this.dmChats.get(executorId);
    if (executorDms) {
      const updated = this.updateOwnIdentity(executorDms, otherUser, newIdentity);
      this.dmChats.set(executorId, updated);
    }

    const otherDms = this.dmChats.get(otherUser);
    if (otherDms) {
      const updated = this.updateOtherIdentity(otherDms, executorId, newIdentity);
      this.dmChats.set(otherUser, updated);
    }

    emit(new NewIdentityUpdated(otherUser));
    return 'Identity updated successfully';
  }

  deleteDM(executorId: UserId, args: DeleteDMArgs): string {
    const { otherUser } = args;
    this.removeDmFromUser(executorId, otherUser);
    this.removeDmFromUser(otherUser, executorId);

    emit(new DMDeleted(executorId));
    return 'DM deleted successfully';
  }

  private addDmToUser(userId: UserId, chat: DMChatInfo): void {
    let vector = this.dmChats.get(userId);
    if (!vector) {
      vector = createVector<DMChatInfo>();
    }
    vector.push(chat);
    this.dmChats.set(userId, vector);
  }

  private removeDmFromUser(userId: UserId, otherUser: UserId): void {
    const existing = this.dmChats.get(userId);
    if (!existing) {
      return;
    }
    const remaining = createVector<DMChatInfo>();
    for (const chat of existing.toArray()) {
      if (chat.otherIdentityOld !== otherUser) {
        remaining.push(chat);
      }
    }
    this.dmChats.set(userId, remaining);
  }

  private updateOwnIdentity(
    vector: Vector<DMChatInfo>,
    otherUser: UserId,
    newIdentity: UserId
  ): Vector<DMChatInfo> {
    const updated = createVector<DMChatInfo>();
    for (const chat of vector.toArray()) {
      if (chat.otherIdentityOld === otherUser) {
        updated.push({
          ...chat,
          ownIdentity: newIdentity,
          didJoin: true,
        });
      } else {
        updated.push(chat);
      }
    }
    return updated;
  }

  private updateOtherIdentity(
    vector: Vector<DMChatInfo>,
    executorId: UserId,
    newIdentity: UserId
  ): Vector<DMChatInfo> {
    const updated = createVector<DMChatInfo>();
    for (const chat of vector.toArray()) {
      if (chat.otherIdentityOld === executorId) {
        updated.push({
          ...chat,
          otherIdentityNew: newIdentity,
        });
      } else {
        updated.push(chat);
      }
    }
    return updated;
  }

  updateDmHash(executorId: UserId, contextId: string, newHash: string): string {
    // Update the last read hash for this user in this DM context
    let userHashMap = this.dmReadHashes.get(contextId);
    if (!userHashMap) {
      userHashMap = createUnorderedMap<UserId, LwwRegister<string>>();
      this.dmReadHashes.set(contextId, userHashMap);
    }

    let hashRegister = userHashMap.get(executorId);
    if (!hashRegister) {
      hashRegister = createLwwRegister<string>({ initialValue: newHash });
      userHashMap.set(executorId, hashRegister);
    }

    // Update the hash
    hashRegister.set(newHash);

    return 'DM hash updated';
  }

  readDm(executorId: UserId, contextId: string): string {
    // Get the DM chat info to find the current hash
    const dms = this.getDMs(executorId);
    const dm = dms.find(d => d.contextId === contextId);

    if (!dm) {
      return 'DM not found';
    }

    // Update the last read hash to the current newHash
    let userHashMap = this.dmReadHashes.get(contextId);
    if (!userHashMap) {
      userHashMap = createUnorderedMap<UserId, LwwRegister<string>>();
      this.dmReadHashes.set(contextId, userHashMap);
    }

    let hashRegister = userHashMap.get(executorId);
    if (!hashRegister) {
      hashRegister = createLwwRegister<string>({ initialValue: dm.newHash });
      userHashMap.set(executorId, hashRegister);
    }

    // Set the current hash as the last read hash
    hashRegister.set(dm.newHash);

    return 'DM marked as read';
  }
}
