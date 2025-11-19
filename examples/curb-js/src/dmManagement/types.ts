import type { ChannelType } from "../channelManagement/types";
import type { UserId } from "../types";

export type DMChatInfo = {
  createdAt: bigint;
  contextId: string;
  channelType: ChannelType;
  createdBy: UserId;
  ownIdentityOld: UserId;
  ownIdentity?: UserId;
  ownUsername: string;
  otherIdentityOld: UserId;
  otherIdentityNew?: UserId;
  otherUsername: string;
  didJoin: boolean;
  invitationPayload: string;
  oldHash: string;
  newHash: string;
  unreadMessages: number;
};

export type CreateDMChatArgs = {
  contextId: string;
  creator: UserId;
  creatorNewIdentity: UserId;
  invitee: UserId;
  timestamp: bigint;
  contextHash: string;
  invitationPayload: string;
};

export type UpdateIdentityArgs = {
  otherUser: UserId;
  newIdentity: UserId;
};

export type DeleteDMArgs = {
  otherUser: UserId;
};

