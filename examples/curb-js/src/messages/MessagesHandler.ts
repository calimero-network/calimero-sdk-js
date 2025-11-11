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

      const timestamp = env.timeNow().toString();
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
    const allMessages = this.safeVectorToArray(messagesVector);
    const total = allMessages.length;
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
      const slice = allMessages.slice(startIndex, endIndex);
      const previous = startIndex > 0 ? allMessages[startIndex - 1] : null;
      return {
        messages: slice.map(message => this.formatMessage(message, channelId, parentId)),
        nextCursor: previous ? this.getMessageId(previous) : null,
        hasMore: startIndex > 0,
        total,
      };
    }

    let endIndex = total;
    if (input.cursor) {
      const cursorIndex = allMessages.findIndex(
        message => this.getMessageId(message) === input.cursor
      );
      if (cursorIndex >= 0) {
        endIndex = cursorIndex;
      }
    }

    const startIndex = Math.max(0, endIndex - limit);
    const slice = allMessages.slice(startIndex, endIndex);
    const previous = startIndex > 0 ? allMessages[startIndex - 1] : null;
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
    timestamp: string;
    mentions: MentionInput[];
    mentionUsernames: string[];
    files: AttachmentInput[];
    images: AttachmentInput[];
  }): Message {
    const mentions = new UnorderedSet<UserId>();
    for (const mention of params.mentions) {
      mentions.add(mention.userId);
    }

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
      files: this.buildAttachmentVector(params.files, params.timestamp),
      images: this.buildAttachmentVector(params.images, params.timestamp),
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
    const timestamp = this.readString(message.timestamp);
    const editedAt = message.editedOn !== null ? this.readString(message.editedOn) : null;
    const deleted = message.deleted !== null ? this.readBoolean(message.deleted) : false;
    return {
      id: this.getMessageId(message),
      channelId,
      parentId,
      senderId: message.sender,
      senderUsername: this.readString(message.senderUsername),
      text: this.readString(message.text),
      timestamp,
      editedAt,
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
    timestamp: string,
    parentId: string | null
  ): string {
    const parentSegment = parentId ?? 'root';
    return `${channelId}:${senderId}:${timestamp}:${parentSegment}`;
  }

  private buildAttachmentVector(
    inputs: AttachmentInput[],
    fallbackTimestamp: string
  ): Vector<Attachment> {
    const vector = new Vector<Attachment>();
    for (const input of inputs) {
      vector.push({
        name: input.name,
        mimeType: input.mimeType,
        size: String(
          typeof input.size === 'bigint'
            ? String(input.size)
            : typeof input.size === 'number'
            ? String(input.size)
            : 0
        ),
        blobId: input.blobId,
        uploadedAt:
          input.uploadedAt !== undefined
            ? String(
                typeof input.uploadedAt === 'bigint'
                  ? String(input.uploadedAt)
                  : typeof input.uploadedAt === 'number'
                  ? String(input.uploadedAt)
                  : fallbackTimestamp
              )
            : fallbackTimestamp,
      });
    }
    return vector;
  }

  private serializeAttachments(vector: Vector<Attachment>): AttachmentResponse[] {
    const attachments = this.safeVectorToArray(vector);
    return attachments.map(attachment => ({
      name: this.readString(attachment.name),
      mimeType: this.readString(attachment.mimeType),
      size: this.readString(attachment.size),
      blobId: attachment.blobId,
      uploadedAt: this.readString(attachment.uploadedAt),
    }));
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

  private safeVectorToArray<T>(vector: Vector<T>): T[] {
    try {
      return vector.toArray();
    } catch (error){
      env.log("FX: ERROR: " + (error as Error).message + " " + (error as Error).stack);
      const results: T[] = [];
      for (let index = 0; ; index += 1) {
        try {
          const value = vector.get(index);
          env.log("FX: VALUE: " + value?.toString());
          if (value === null || value === undefined) {
            break;
          }
          results.push(value);
        } catch {
          break;
        }
      }
      return results;
    }
  }
}
