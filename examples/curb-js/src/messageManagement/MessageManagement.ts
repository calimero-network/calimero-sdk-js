import {
  emit,
  env,
  createUnorderedMap,
  createVector,
  createUnorderedSet,
  createLwwRegister,
} from '@calimero/sdk';
import { UnorderedMap, UnorderedSet, Vector, LwwRegister } from '@calimero/sdk/collections';
import { blobAnnounceToContext, contextId } from '@calimero/sdk/env';
import bs58 from 'bs58';

import type {
  StoredMessage,
  SendMessageArgs,
  EditMessageArgs,
  DeleteMessageArgs,
  UpdateReactionArgs,
  GetMessagesArgs,
  FullMessageResponse,
  MessageWithReactions,
  Reaction,
  ReadMessageProps,
} from './types';
import type { UserId, ChannelId } from '../types';
import type { ChannelMetadata } from '../channelManagement/types';
import { MessageSent, MessageSentThread, ReactionUpdated } from './events';

const BLOB_ID_BYTES = 32;

function blobIdFromString(value: string): Uint8Array {
  const decoded = bs58.decode(value);
  if (decoded.length !== BLOB_ID_BYTES) {
    throw new Error(`Blob ID must decode to exactly ${BLOB_ID_BYTES} bytes`);
  }
  return decoded;
}

export class MessageManagement {
  constructor(
    private readonly channels: UnorderedMap<ChannelId, ChannelMetadata>,
    private readonly channelReadPositions: UnorderedMap<
      ChannelId,
      UnorderedMap<UserId, LwwRegister<bigint>>
    >
  ) {}

  sendMessage(executorId: UserId, username: string | null, args: SendMessageArgs): StoredMessage {
    const timestamp = env.timeNow();
    const messageId =
      args.messageId ?? this.generateMessageId(args.channelId, executorId, timestamp);

    // Announce blobs to context for discovery
    const currentContext = contextId();

    // Announce image blobs
    if (args.images) {
      for (const image of args.images) {
        try {
          const blobBytes = blobIdFromString(image.blob_id_str);
          const announced = blobAnnounceToContext(blobBytes, currentContext);
          if (!announced) {
            env.log(`Warning: failed to announce image blob ${image.blob_id_str} to context`);
          }
        } catch (error) {
          env.log(
            `Warning: failed to decode image blob ID ${image.blob_id_str}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // Announce file blobs
    if (args.files) {
      for (const file of args.files) {
        try {
          const blobBytes = blobIdFromString(file.blob_id_str);
          const announced = blobAnnounceToContext(blobBytes, currentContext);
          if (!announced) {
            env.log(`Warning: failed to announce file blob ${file.blob_id_str} to context`);
          }
        } catch (error) {
          env.log(
            `Warning: failed to decode file blob ID ${file.blob_id_str}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    const payload: StoredMessage = {
      id: messageId,
      channelId: args.channelId,
      senderId: executorId,
      senderUsername: username ?? executorId,
      text: args.text,
      timestamp,
      parentId: args.parentId ?? null,
      deleted: false,
      editedAt: null,
      images: args.images,
      files: args.files,
      mentions: args.mentions ?? [],
      mentionUsernames: args.mentionUsernames ?? [],
    };

    const normalizedChannelId = args.channelId.trim().toLowerCase();
    const channel = this.channels.get(normalizedChannelId);
    if (!channel) {
      throw new Error(`Channel ${normalizedChannelId} not found`);
    }

    if (args.parentId) {
      // Get or create thread messages map entry
      let threadRegister = channel.threadMessages.get(args.parentId);
      if (!threadRegister) {
        const threadVector = createVector<StoredMessage>();
        threadRegister = createLwwRegister<Vector<StoredMessage>>({ initialValue: threadVector });
        channel.threadMessages.set(args.parentId, threadRegister);
      }
      this.appendToVectorToRegister(threadRegister, payload);
      emit(new MessageSentThread(args.channelId, args.parentId, messageId));
    } else {
      this.appendToVectorToRegister(channel.channelMessages, payload);
      emit(new MessageSent(args.channelId, messageId));
    }

    return payload;
  }

  getMessages(args: GetMessagesArgs): FullMessageResponse {
    const normalizedChannelId = args.channelId.trim().toLowerCase();
    const channel = this.channels.get(normalizedChannelId);
    if (!channel) {
      return {
        messages: [],
        total_count: 0,
        start_position: args.offset ?? 0,
      };
    }

    const register = args.parentId
      ? channel.threadMessages.get(args.parentId)
      : channel.channelMessages;
    if (!register) {
      return {
        messages: [],
        total_count: 0,
        start_position: args.offset ?? 0,
      };
    }

    const vector = register.get();
    if (!vector) {
      return {
        messages: [],
        total_count: 0,
        start_position: args.offset ?? 0,
      };
    }

    // Try to get all items, but handle case where vector might not be fully synced
    let allItems: StoredMessage[] = [];
    let totalCount = 0;
    try {
      allItems = vector.toArray();
      totalCount = allItems.length;
    } catch (error) {
      // Vector might not be fully synced yet, return empty result
      env.log(
        `Warning: Vector not fully synced for ${args.parentId ? `thread ${args.parentId}` : `channel ${args.channelId}`}`
      );
      return {
        messages: [],
        total_count: 0,
        start_position: args.offset ?? 0,
      };
    }

    const startPosition = args.offset ?? 0;
    const limit = args.limit;

    // Get the sliced messages (use allItems we already fetched to avoid calling toArray again)
    const start = startPosition;
    const end = limit ? start + limit : allItems.length;
    const slicedMessages = allItems.slice(Math.max(0, start), Math.min(allItems.length, end));

    // Add reactions and thread info to each message
    const messagesWithReactions: MessageWithReactions[] = slicedMessages.map(message => {
      const reactionMap = channel.messageReactions.get(message.id);
      const reactions: Reaction[] = [];

      if (reactionMap) {
        try {
          const emojiEntries = reactionMap.entries();
          for (const [emoji, users] of emojiEntries) {
            try {
              const userArray = users.toArray();
              // Only include reactions that have at least one user
              if (userArray.length > 0) {
                reactions.push({
                  emoji,
                  users: userArray,
                });
              }
            } catch {
              // User set might not be synced yet, skip this reaction
              continue;
            }
          }
        } catch {
          // Reaction map might not be synced yet, skip reactions
        }
      }

      // Calculate thread count and last timestamp for this message
      let threadCount = 0;
      let threadLastTimestamp: bigint | undefined = undefined;

      // Only calculate thread info if this is NOT a thread message itself (no parentId)
      if (!message.parentId) {
        const threadRegister = channel.threadMessages.get(message.id);
        if (threadRegister) {
          const threadVector = threadRegister.get();
          if (threadVector) {
            try {
              const threadMessages = threadVector.toArray();
              threadCount = threadMessages.length;
              if (threadCount > 0) {
                // Get the last message in the thread (most recent)
                const lastMessage = threadMessages[threadMessages.length - 1];
                threadLastTimestamp = lastMessage.timestamp;
              }
            } catch {
              // Thread vector might not be synced yet
              threadCount = 0;
            }
          }
        }
      }

      return {
        ...message,
        reactions,
        threadCount,
        threadLastTimestamp,
      };
    });

    return {
      messages: messagesWithReactions,
      total_count: totalCount,
      start_position: startPosition,
    };
  }

  editMessage(executorId: UserId, args: EditMessageArgs): string {
    const normalizedChannelId = args.channelId.trim().toLowerCase();
    const channel = this.channels.get(normalizedChannelId);
    if (!channel) {
      return 'Channel not found';
    }

    const register = args.parentId
      ? channel.threadMessages.get(args.parentId)
      : channel.channelMessages;
    if (!register) {
      return 'Message not found';
    }

    const vector = register.get() ?? createVector<StoredMessage>();
    if (!vector) {
      return 'Message not found';
    }

    const result = this.updateMessage(vector, args.messageId, message => {
      if (message.senderId !== executorId) {
        return { ok: false, error: 'You can only edit your messages' };
      }
      return {
        ok: true,
        value: {
          ...message,
          text: args.text,
          editedAt: env.timeNow(),
        },
      };
    });

    if (!result.ok) {
      return result.error;
    }

    // Set the new vector back in the register
    register.set(result.vector);

    if (args.parentId) {
      emit(new MessageSentThread(args.channelId, args.parentId, args.messageId));
    } else {
      emit(new MessageSent(args.channelId, args.messageId));
    }

    return 'Message updated';
  }

  deleteMessage(executorId: UserId, args: DeleteMessageArgs, isModerator: boolean): string {
    const normalizedChannelId = args.channelId.trim().toLowerCase();
    const channel = this.channels.get(normalizedChannelId);
    if (!channel) {
      return 'Channel not found';
    }

    const register = args.parentId
      ? channel.threadMessages.get(args.parentId)
      : channel.channelMessages;
    if (!register) {
      return 'Message not found';
    }

    const vector = register.get() ?? createVector<StoredMessage>();
    if (!vector) {
      return 'Message not found';
    }

    const result = this.updateMessage(vector, args.messageId, message => {
      if (message.senderId !== executorId && !isModerator) {
        return { ok: false, error: "You don't have permission to delete this message" };
      }
      return {
        ok: true,
        value: {
          ...message,
          text: '',
          deleted: true,
        },
      };
    });

    if (!result.ok) {
      return result.error;
    }

    // Set the new vector back in the register
    register.set(result.vector);

    if (args.parentId) {
      emit(new MessageSentThread(args.channelId, args.parentId, args.messageId));
    } else {
      emit(new MessageSent(args.channelId, args.messageId));
    }

    // Remove reactions for deleted message
    channel.messageReactions.remove(args.messageId);
    return 'Message deleted';
  }

  /**
   * Finds a message by ID and returns its channelId
   * Returns null if message not found
   * Searches both regular messages and thread messages
   */
  findMessageChannelId(messageId: string): string | null {
    // First, check in all channels (regular messages)
    const channelEntries = this.channels.entries();
    for (const [, channel] of channelEntries) {
      const register = channel.channelMessages;
      if (!register) {
        continue;
      }
      const vector = register.get();
      if (!vector) {
        continue;
      }
      try {
        const messages = vector.toArray();
        const message = messages.find(msg => msg.id === messageId);
        if (message) {
          return message.channelId;
        }
      } catch {
        // Vector might not be synced yet, skip
        continue;
      }
    }

    // If not found, check in all threads
    const channelEntriesForThreads = this.channels.entries();
    for (const [, channel] of channelEntriesForThreads) {
      const threadEntries = channel.threadMessages.entries();
      for (const [, register] of threadEntries) {
        if (!register) {
          continue;
        }
        const vector = register.get();
        if (!vector) {
          continue;
        }
        try {
          const messages = vector.toArray();
          const message = messages.find(msg => msg.id === messageId);
          if (message) {
            return message.channelId;
          }
        } catch {
          // Vector might not be synced yet, skip
          continue;
        }
      }
    }

    return null;
  }

  updateReaction(args: UpdateReactionArgs, username: string): string {
    // Find the channel that contains this message
    const channelId = this.findMessageChannelId(args.messageId);
    if (!channelId) {
      return 'Message not found';
    }

    const normalizedChannelId = channelId.trim().toLowerCase();
    const channel = this.channels.get(normalizedChannelId);
    if (!channel) {
      return 'Channel not found';
    }

    // Get or create the reaction map for this message
    let reactionMap = channel.messageReactions.get(args.messageId);
    if (!reactionMap) {
      reactionMap = createUnorderedMap<string, UnorderedSet<UserId>>();
      channel.messageReactions.set(args.messageId, reactionMap);
    }

    // Get or create the user set for this emoji
    let users = reactionMap.get(args.emoji);
    if (!users) {
      users = createUnorderedSet<UserId>();
      reactionMap.set(args.emoji, users);
    }

    // Direct mutations - automatically propagate thanks to nested tracking!
    if (args.add) {
      users.add(username);
    } else {
      users.delete(username);

      // If the set is now empty, remove the emoji entry from the map
      if (users.size() === 0) {
        reactionMap.remove(args.emoji);
      }
    }

    emit(new ReactionUpdated(args.messageId));
    return 'Reaction updated';
  }

  private appendToVectorToRegister(
    register: LwwRegister<Vector<StoredMessage>>,
    value: StoredMessage
  ): void {
    const currentVector = register.get() ?? createVector<StoredMessage>();

    // Create a new vector to ensure proper CRDT synchronization
    const newVector = createVector<StoredMessage>();

    // Copy existing items to the new vector
    try {
      const existingItems = currentVector.toArray();
      for (const item of existingItems) {
        newVector.push(item);
      }
    } catch {
      // If toArray fails, start with empty vector
    }

    // Add the new item
    newVector.push(value);

    // Set the new vector back in the register
    register.set(newVector);
  }

  private sliceVector(
    vector: Vector<StoredMessage> | null,
    limit?: number,
    offset?: number
  ): StoredMessage[] {
    if (!vector) {
      return [];
    }
    const items = vector.toArray();
    if (!items.length) {
      return [];
    }
    const start = offset ?? 0;
    const end = limit ? start + limit : items.length;
    return items.slice(Math.max(0, start), Math.min(items.length, end));
  }

  private updateMessage(
    vector: Vector<StoredMessage>,
    messageId: string,
    transform: (
      message: StoredMessage
    ) => { ok: true; value: StoredMessage } | { ok: false; error: string }
  ): { ok: true; vector: Vector<StoredMessage> } | { ok: false; error: string } {
    const items = vector.toArray();
    for (let index = 0; index < items.length; index += 1) {
      if (items[index].id === messageId) {
        const result = transform(items[index]);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        const updated = result.value;
        // Create a completely new vector with the updated message
        const newVector = createVector<StoredMessage>();
        for (let i = 0; i < items.length; i += 1) {
          newVector.push(i === index ? updated : items[i]);
        }
        return { ok: true, vector: newVector };
      }
    }
    return { ok: false, error: 'Message not found' };
  }

  readMessage(executorId: UserId, args: ReadMessageProps, _channel: ChannelMetadata): string {
    const normalizedChannelId = args.channelId.trim().toLowerCase();

    // Get messages to find the specific message
    const messages = this.getMessages({ channelId: normalizedChannelId });

    // Find the message
    const message = messages.messages.find(m => m.id === args.messageId);
    if (!message) {
      return 'Message not found';
    }

    // Update last read position for this user in this channel
    let userReadMap = this.channelReadPositions.get(normalizedChannelId);
    if (!userReadMap) {
      userReadMap = createUnorderedMap<UserId, LwwRegister<bigint>>();
      this.channelReadPositions.set(normalizedChannelId, userReadMap);
    }

    let readRegister = userReadMap.get(executorId);
    if (!readRegister) {
      readRegister = createLwwRegister<bigint>({ initialValue: 0n });
      userReadMap.set(executorId, readRegister);
    }

    // Set the message timestamp as the last read position
    readRegister.set(message.timestamp);

    return 'Message marked as read';
  }

  private generateMessageId(channelId: string, executorId: UserId, timestamp: bigint): string {
    const random = Math.floor(Math.random() * 1e6).toString(16);
    return `${channelId}-${executorId}-${timestamp}-${random}`;
  }
}
