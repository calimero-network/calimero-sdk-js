import { emit, createVector } from '@calimero/sdk';
import { UnorderedMap, Vector } from '@calimero/sdk/collections';

import { ChannelType } from '../channelManagement/types';
import type { UserId } from '../types';
import type { CreateDMChatArgs, DeleteDMArgs, DMChatInfo, UpdateIdentityArgs } from './types';
import { DMCreated, NewIdentityUpdated, DMDeleted } from './events';

export class DmManagement {
  constructor(private readonly dmChats: UnorderedMap<UserId, Vector<DMChatInfo>>) {}

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
}
