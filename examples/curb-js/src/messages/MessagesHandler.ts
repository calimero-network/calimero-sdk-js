import { UnorderedSet, Vector } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

import type { ChatMemberAccess, ChatState, ChannelId, UserId } from '../types';
import type { Attachment, ChannelInfo, Message } from '../channels/types';
import type {
  AttachmentInput,
  AttachmentResponse,
  FetchMessagesInput,
  MentionInput,
  MessageResponse,
  MessagesPage,
  SendMessageInput,
} from './types';

const DEFAULT_PAGE_SIZE = 50;

interface ExtendedChatState extends ChatState {
  channels: ChatState['channels'];
  threads: ChatState['threads'];
}

export class MessagesHandler {
  constructor(
    private readonly state: ExtendedChatState,
    private readonly membersAccess: ChatMemberAccess
  ) {}

  sendMessage(input: SendMessageInput): string {
    try {
      const { channelId, text } = input;
      const parentId = input.parentId ?? null;
      const channel = this.requireChannel(channelId);
      const senderId = this.membersAccess.getExecutorId();
      this.ensureChannelMember(channel, senderId);

      const trimmed = text.trim();
      if (!trimmed) {
        return 'Failed to send message';
      }

      const senderUsername = this.membersAccess.getUsername(senderId) ?? input.senderUsername ?? '';
      if (!senderUsername) {
        return 'Failed to send message';
      }

      const timestamp = env.timeNow();
      const messageId = this.buildMessageId(channelId, senderId, timestamp, parentId);
      const message = this.createMessage({
        channelId,
        messageId,
        parentId,
        senderId,
        senderUsername,
        text: trimmed,
        timestamp,
        mentions: input.mentions ?? [],
        mentionUsernames: input.mentionUsernames ?? [],
        files: input.files ?? [],
        images: input.images ?? [],
      });
      if (parentId) {
        const thread = this.getThread(parentId);
        thread.push(message);
        this.state.threads.set(parentId, thread);
      } else {
        channel.messages.push(message);
        this.state.channels.set(channelId, channel);
      }

      return messageId;
    } catch {
      return 'Failed to send message';
    }
  }

  fetchMessages(input: FetchMessagesInput): MessagesPage | string {
    const { channelId } = input;
    const parentId = input.parentId ?? null;
    const channel = this.requireChannel(channelId);
    const executorId = this.membersAccess.getExecutorId();
    this.ensureChannelMember(channel, executorId);

    const limit = Math.max(1, input.limit ?? DEFAULT_PAGE_SIZE);
    const offset = Math.max(0, input.offset ?? 0);
    const messagesVector = parentId ? this.getThread(parentId) : channel.messages;
    const total = this.vectorLength(messagesVector);
    if (total === 0) {
      return {
        messages: [],
        nextCursor: null,
        hasMore: false,
        total: 0,
      };
    }
    if (!input.cursor) {
      if (offset >= total) {
        return {
          messages: [],
          nextCursor: null,
          hasMore: false,
          total,
        };
      }

      const endIndex = Math.max(0, total - offset);
      const startIndex = Math.max(0, endIndex - limit);
      const slice = this.collectVectorRange(messagesVector, startIndex, endIndex);
      const previous = startIndex > 0 ? this.getVectorValue(messagesVector, startIndex - 1) : null;
      return {
        messages: slice.map(message => this.formatMessage(message, channelId, parentId)),
        nextCursor: previous ? this.getMessageId(previous) : null,
        hasMore: startIndex > 0,
        total,
      };
    }

    let endIndex = total;
    if (input.cursor) {
      const cursorIndex = this.findMessageIndex(messagesVector, input.cursor);
      if (cursorIndex >= 0) {
        endIndex = cursorIndex;
      }
    }

    const startIndex = Math.max(0, endIndex - limit);
    const slice = this.collectVectorRange(messagesVector, startIndex, endIndex);
    const previous = startIndex > 0 ? this.getVectorValue(messagesVector, startIndex - 1) : null;
    const formatted = slice.map(message => this.formatMessage(message, channelId, parentId));

    return {
      messages: formatted,
      nextCursor: previous ? this.getMessageId(previous) : null,
      hasMore: startIndex > 0,
      total,
    };
  }

  private createMessage(params: {
    channelId: ChannelId;
    messageId: string;
    parentId: string | null;
    senderId: UserId;
    senderUsername: string;
    text: string;
    timestamp: bigint;
    mentions: MentionInput[];
    mentionUsernames: string[];
    files: AttachmentInput[];
    images: AttachmentInput[];
  }): Message {
    const mentions = new UnorderedSet<UserId>();
    for (const mention of params.mentions) {
      mentions.add(mention.userId);
    }

    const files = this.buildAttachmentVector(params.files, params.timestamp);
    const images = this.buildAttachmentVector(params.images, params.timestamp);

    const mentionsUsernames = new Vector<string>();
    for (const mentionUsername of params.mentionUsernames) {
      mentionsUsernames.push(mentionUsername);
    }

    return {
      timestamp: params.timestamp,
      sender: params.senderId,
      senderUsername: params.senderUsername,
      mentions,
      mentionsUsernames,
      files,
      images,
      id: params.messageId,
      text: params.text,
      editedOn: null,
      deleted: null,
      group: params.channelId,
    };
  }

  private formatMessage(
    message: Message,
    channelId: ChannelId,
    parentId: string | null
  ): MessageResponse {
    const timestamp = this.readBigInt(message.timestamp);
    const editedAt = message.editedOn !== null ? this.readBigInt(message.editedOn) : null;
    const deleted = message.deleted !== null ? this.readBoolean(message.deleted) : false;
    return {
      id: this.getMessageId(message),
      channelId,
      parentId,
      senderId: message.sender,
      senderUsername: this.readString(message.senderUsername),
      text: this.readString(message.text),
      timestamp: timestamp.toString(),
      editedAt: editedAt !== null ? editedAt.toString() : null,
      deleted,
      mentions: message.mentions
        .toArray()
        .map(userId => ({ userId, username: this.membersAccess.getUsername(userId) ?? '' })),
      mentionUsernames: message.mentionsUsernames.toArray().map(entry => this.readString(entry)),
      files: this.serializeAttachments(message.files),
      images: this.serializeAttachments(message.images),
    };
  }

  private requireChannel(channelId: ChannelId): ChannelInfo {
    const channel = this.state.channels.get(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }
    return channel;
  }

  private ensureChannelMember(channel: ChannelInfo, userId: UserId): void {
    if (!channel.metadata.members.has(userId)) {
      throw new Error('User is not a member of this channel');
    }
  }

  private getThread(parentId: string): Vector<Message> {
    const existing = this.state.threads.get(parentId);
    if (existing) {
      return existing;
    }
    const created = new Vector<Message>();
    this.state.threads.set(parentId, created);
    return created;
  }

  private getMessageId(message: Message): string {
    return this.readString(message.id);
  }

  private buildMessageId(
    channelId: ChannelId,
    senderId: UserId,
    timestamp: bigint,
    parentId: string | null
  ): string {
    const parentSegment = parentId ?? 'root';
    return `${channelId}:${senderId}:${timestamp}:${parentSegment}`;
  }

  private buildAttachmentVector(
    inputs: AttachmentInput[],
    fallbackTimestamp: bigint
  ): Vector<Attachment> {
    const vector = new Vector<Attachment>();
    for (const input of inputs) {
      vector.push({
        name: input.name,
        mimeType: input.mimeType,
        size: BigInt(input.size),
        blobId: input.blobId,
        uploadedAt: input.uploadedAt !== undefined ? BigInt(input.uploadedAt) : fallbackTimestamp,
      });
    }
    return vector;
  }

  private serializeAttachments(vector: Vector<Attachment>): AttachmentResponse[] {
    const attachments = this.collectVectorRange(vector, 0, this.vectorLength(vector));
    return attachments.map(attachment => ({
      name: this.readString(attachment.name),
      mimeType: this.readString(attachment.mimeType),
      size: this.readBigInt(attachment.size).toString(),
      blobId: attachment.blobId,
      uploadedAt: this.readBigInt(attachment.uploadedAt).toString(),
    }));
  }

  private vectorLength<T>(vector: Vector<T>): number {
    if (typeof vector.len === 'function') {
      try {
        return vector.len();
      } catch {
        // fall through to fallback
      }
    }
    const fallback = this.safeVectorToArray(vector);
    return fallback ? fallback.length : 0;
  }

  private getVectorValue<T>(vector: Vector<T>, index: number): T | null {
    if (typeof vector.get === 'function') {
      try {
        return vector.get(index);
      } catch {
        // fall through
      }
    }
    const fallback = this.safeVectorToArray(vector);
    if (fallback && index >= 0 && index < fallback.length) {
      const value = fallback[index];
      return value !== undefined && value !== null ? value : null;
    }
    return null;
  }

  private collectVectorRange<T>(vector: Vector<T>, start: number, end: number): T[] {
    const results: T[] = [];
    let length = 0;
    if (typeof vector.len === 'function') {
      try {
        length = vector.len();
      } catch {
        length = 0;
      }
    }

    if (length > 0 && typeof vector.get === 'function') {
      const cappedEnd = Math.min(end, length);
      for (let index = start; index < cappedEnd; index += 1) {
        try {
          const value = vector.get(index);
          if (value !== null && value !== undefined) {
            results.push(value);
          }
        } catch {
          break;
        }
      }
      return results;
    }

    const fallback = this.safeVectorToArray(vector);
    if (!fallback) {
      return results;
    }
    const cappedEnd = Math.min(end, fallback.length);
    for (let index = start; index < cappedEnd; index += 1) {
      const value = fallback[index];
      if (value !== undefined && value !== null) {
        results.push(value);
      }
    }
    return results;
  }

  private findMessageIndex(vector: Vector<Message>, targetId: string): number {
    const length = this.vectorLength(vector);
    for (let index = length - 1; index >= 0; index -= 1) {
      const message = this.getVectorValue(vector, index);
      if (message && this.getMessageId(message) === targetId) {
        return index;
      }
    }
    return -1;
  }

  private readString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (this.isRegisterLike(value)) {
      const extracted = value.get();
      return typeof extracted === 'string' ? extracted : String(extracted ?? '');
    }
    return String(value ?? '');
  }

  private readBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      return BigInt(value);
    }
    if (typeof value === 'string') {
      try {
        return BigInt(value);
      } catch {
        return 0n;
      }
    }
    if (this.isRegisterLike(value)) {
      return this.readBigInt(value.get());
    }
    return 0n;
  }

  private readBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (this.isRegisterLike(value)) {
      return this.readBoolean(value.get());
    }
    return Boolean(value);
  }

  private isRegisterLike(value: unknown): value is { get(): unknown } {
    return Boolean(value) && typeof value === 'object' && typeof (value as { get(): unknown }).get === 'function';
  }

  private safeVectorToArray<T>(vector: Vector<T>): T[] | null {
    if (typeof (vector as { toArray?: () => T[] }).toArray === 'function') {
      try {
        return (vector as { toArray(): T[] }).toArray();
      } catch {
        return null;
      }
    }
    return null;
  }
}
