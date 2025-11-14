import { emit, env } from "@calimero/sdk";
import { UnorderedMap, UnorderedSet, Vector } from "@calimero/sdk/collections";

import type { StoredMessage, MessageAttachments, SendMessageArgs, EditMessageArgs, DeleteMessageArgs, UpdateReactionArgs, GetMessagesArgs } from "./types";
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
  ): string {
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
      attachments: args.attachments,
    };

    if (args.parentId) {
      this.appendToVector(this.threads, args.parentId, payload);
      emit(new MessageSentThread(args.channelId, args.parentId, messageId));
    } else {
      this.appendToVector(this.messages, args.channelId, payload);
      emit(new MessageSent(args.channelId, messageId));
    }

    return messageId;
  }

  getMessages(args: GetMessagesArgs): StoredMessage[] {
    if (args.parentId) {
      return this.sliceVector(this.threads.get(args.parentId), args.limit, args.offset);
    }
    return this.sliceVector(this.messages.get(args.channelId), args.limit, args.offset);
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

  updateReaction(executorId: UserId, args: UpdateReactionArgs): string {
    let reactionMap = this.reactions.get(args.messageId);
    if (!reactionMap) {
      reactionMap = new UnorderedMap<string, UnorderedSet<UserId>>();
    }

    let users = reactionMap.get(args.emoji);
    if (!users) {
      users = new UnorderedSet<UserId>();
    }

    if (args.add) {
      users.add(executorId);
    } else {
      users.delete(executorId);
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

