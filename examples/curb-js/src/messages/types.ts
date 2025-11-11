import type { ChannelId, UserId } from '../types';
export interface AttachmentInput {
  name: string;
  mimeType: string;
  size: bigint | number;
  blobId: Uint8Array;
  uploadedAt?: bigint | number;
}

export interface AttachmentResponse {
  name: string;
  mimeType: string;
  size: string;
  blobId: Uint8Array;
  uploadedAt: string;
}

export interface MentionInput {
  userId: UserId;
  username: string;
}

export interface SendMessageInput {
  channelId: ChannelId;
  text: string;
  parentId?: string | null;
  senderUsername?: string;
  mentions?: MentionInput[];
  mentionUsernames?: string[];
  files?: AttachmentInput[];
  images?: AttachmentInput[];
}

export interface FetchMessagesInput {
  channelId: ChannelId;
  parentId?: string | null;
  cursor?: string | null;
  limit?: number;
  offset?: number;
}

export interface MessageResponse {
  id: string;
  channelId: ChannelId;
  parentId: string | null;
  senderId: UserId;
  senderUsername: string;
  text: string;
  timestamp: string;
  editedAt: string | null;
  deleted: boolean;
  mentions: MentionInput[];
  mentionUsernames: string[];
  files: AttachmentResponse[];
  images: AttachmentResponse[];
}

export interface MessagesPage {
  messages: MessageResponse[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

