import type { UserId } from "../types";

export type MessageAttachments = {
  files?: string[];
  images?: string[];
};

export type StoredMessage = {
  id: string;
  channelId: string;
  senderId: UserId;
  senderUsername: string;
  text: string;
  timestamp: bigint;
  parentId?: string | null;
  deleted: boolean;
  editedAt?: bigint | null;
  attachments?: MessageAttachments;
};

export type SendMessageArgs = {
  channelId: string;
  text: string;
  parentId?: string | null;
  attachments?: MessageAttachments;
  messageId?: string;
};

export type EditMessageArgs = {
  channelId: string;
  messageId: string;
  text: string;
  parentId?: string | null;
};

export type DeleteMessageArgs = {
  channelId: string;
  messageId: string;
  parentId?: string | null;
};

export type UpdateReactionArgs = {
  messageId: string;
  emoji: string;
  add: boolean;
};

export type GetMessagesArgs = {
  channelId: string;
  parentId?: string | null;
  limit?: number;
  offset?: number;
};

