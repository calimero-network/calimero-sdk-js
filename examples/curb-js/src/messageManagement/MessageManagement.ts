import { emit, env } from "@calimero/sdk";
import { UnorderedMap, UnorderedSet, Vector } from "@calimero/sdk/collections";

import type { StoredMessage, SendMessageArgs, EditMessageArgs, DeleteMessageArgs, UpdateReactionArgs, GetMessagesArgs, FullMessageResponse, MessageWithReactions, Reaction } from "./types";
import type { UserId } from "../types";
import { MessageSent, MessageSentThread, ReactionUpdated } from "./events";

export class MessageManagement {
  constructor(
    private readonly messages: UnorderedMap<string, Vector<StoredMessage>>,
    private readonly threads: UnorderedMap<string, Vector<StoredMessage>>,
    private readonly reactions: UnorderedMap<string, UnorderedMap<string, UnorderedSet<UserId>>>,
  ) {}

  sendMessage(
    executorId: UserId,
    username: string | null,
    args: SendMessageArgs,
  ): StoredMessage {
    const timestamp = env.timeNow();
    const messageId =
      args.messageId ?? this.generateMessageId(args.channelId, executorId, timestamp);

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
    };

    if (args.parentId) {
      this.appendToVector(this.threads, args.parentId, payload);
      emit(new MessageSentThread(args.channelId, args.parentId, messageId));
    } else {
      this.appendToVector(this.messages, args.channelId, payload);
      emit(new MessageSent(args.channelId, messageId));
    }

    return payload;
  }

  getMessages(args: GetMessagesArgs): FullMessageResponse {
    const vector = args.parentId ? this.threads.get(args.parentId) : this.messages.get(args.channelId);

    if (!vector) {
      return {
        messages: [],
        total_count: 0,
        start_position: args.offset ?? 0,
      };
    }

    const allItems = vector.toArray();
    const totalCount = allItems.length;
    const startPosition = args.offset ?? 0;
    const limit = args.limit;

    // Get the sliced messages
    const slicedMessages = this.sliceVector(vector, limit, startPosition);

    // Add reactions and thread info to each message
    const messagesWithReactions: MessageWithReactions[] = slicedMessages.map(message => {
      const reactionMap = this.reactions.get(message.id);
      const reactions: Reaction[] = [];

      if (reactionMap) {
        const emojiEntries = reactionMap.entries();
        for (const [emoji, users] of emojiEntries) {
          reactions.push({
            emoji,
            users: users.toArray(),
          });
        }
      }

      // Calculate thread count and last timestamp for this message
      let threadCount = 0;
      let threadLastTimestamp: bigint | undefined = undefined;

      // Only calculate thread info if this is NOT a thread message itself (no parentId)
      if (!message.parentId) {
        const threadVector = this.threads.get(message.id);
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
    const vector = args.parentId ? this.threads.get(args.parentId) : this.messages.get(args.channelId);
    if (!vector) {
      return "Message not found";
    }

    const result = this.updateMessage(vector, args.messageId, message => {
      if (message.senderId !== executorId) {
        return { ok: false, error: "You can only edit your messages" };
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

    if (result !== "ok") {
      return result;
    }

    if (args.parentId) {
      this.threads.set(args.parentId, vector);
      emit(new MessageSentThread(args.channelId, args.parentId, args.messageId));
    } else {
      this.messages.set(args.channelId, vector);
      emit(new MessageSent(args.channelId, args.messageId));
    }

    return "Message updated";
  }

  deleteMessage(executorId: UserId, args: DeleteMessageArgs, isModerator: boolean): string {
    const vector = args.parentId ? this.threads.get(args.parentId) : this.messages.get(args.channelId);
    if (!vector) {
      return "Message not found";
    }

    const result = this.updateMessage(vector, args.messageId, message => {
      if (message.senderId !== executorId && !isModerator) {
        return { ok: false, error: "You don't have permission to delete this message" };
      }
      return {
        ok: true,
        value: {
          ...message,
          text: "",
          deleted: true,
        },
      };
    });

    if (result !== "ok") {
      return result;
    }

    if (args.parentId) {
      this.threads.set(args.parentId, vector);
      emit(new MessageSentThread(args.channelId, args.parentId, args.messageId));
    } else {
      this.messages.set(args.channelId, vector);
      emit(new MessageSent(args.channelId, args.messageId));
    }

    this.reactions.remove(args.messageId);
    return "Message deleted";
  }

  /**
   * Finds a message by ID and returns its channelId
   * Returns null if message not found
   * Searches both regular messages and thread messages
   */
  findMessageChannelId(messageId: string): string | null {
    // First, check in all channels (regular messages)
    const channelEntries = this.messages.entries();
    for (const [, vector] of channelEntries) {
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
    const threadEntries = this.threads.entries();
    for (const [, vector] of threadEntries) {
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

    return null;
  }

  updateReaction(args: UpdateReactionArgs, username: string): string {
    let reactionMap = this.reactions.get(args.messageId);
    if (!reactionMap) {
      reactionMap = new UnorderedMap<string, UnorderedSet<UserId>>();
    }

    let users = reactionMap.get(args.emoji);
    if (!users) {
      users = new UnorderedSet<UserId>();
    }

    if (args.add) {
      users.add(username);
    } else {
      users.delete(username);
    }

    reactionMap.set(args.emoji, users);
    this.reactions.set(args.messageId, reactionMap);

    emit(new ReactionUpdated(args.messageId));
    return "Reaction updated";
  }

  private appendToVector(map: UnorderedMap<string, Vector<StoredMessage>>, key: string, value: StoredMessage): void {
    let vector = map.get(key);
    if (!vector) {
      vector = new Vector<StoredMessage>();
    }
    vector.push(value);
    map.set(key, vector);
  }

  private sliceVector(vector: Vector<StoredMessage> | null, limit?: number, offset?: number): StoredMessage[] {
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
    transform: (message: StoredMessage) => { ok: true; value: StoredMessage } | { ok: false; error: string },
  ): "ok" | string {
    const items = vector.toArray();
    for (let index = 0; index < items.length; index += 1) {
      if (items[index].id === messageId) {
        const result = transform(items[index]);
        if (!result.ok) {
          return result.error;
        }
        const updated = result.value;
        const newVector = new Vector<StoredMessage>();
        for (let i = 0; i < items.length; i += 1) {
          newVector.push(i === index ? updated : items[i]);
        }
        // replace vector contents
        while (vector.pop()) {
          // empty vector
        }
        for (const item of newVector.toArray()) {
          vector.push(item);
        }
        return "ok";
      }
    }
    return "Message not found";
  }

  private generateMessageId(channelId: string, executorId: UserId, timestamp: bigint): string {
    const random = Math.floor(Math.random() * 1e6).toString(16);
    return `${channelId}-${executorId}-${timestamp}-${random}`;
  }
}

