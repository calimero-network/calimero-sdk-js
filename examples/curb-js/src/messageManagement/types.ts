import type { UserId } from "../types";

export type Attachment = {
  name: string;
  mime_type: string;
  size: number;
  blob_id_str: string;
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
  images?: Attachment[];
  files?: Attachment[];
};

export type SendMessageArgs = {
  channelId: string;
  text: string;
  parentId?: string | null;
  images?: Attachment[];
  files?: Attachment[];
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
  username: string;
};

export type GetMessagesArgs = {
  channelId: string;
  parentId?: string | null;
  limit?: number;
  offset?: number;
};

export type Reaction = {
  emoji: string;
  users: string[];
};

export type MessageWithReactions = StoredMessage & {
  reactions: Reaction[];
};

export interface FullMessageResponse {
  messages: MessageWithReactions[];
  total_count: number;
  start_position: number;
}

