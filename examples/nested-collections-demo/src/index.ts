import { State, Logic, Init, View } from '@calimero/sdk';
import { UnorderedMap, UnorderedSet } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class NestedCollectionsDemo {
  messageReactions: UnorderedMap<string, UnorderedMap<string, UnorderedSet<string>>> = new UnorderedMap();
  userGroups: UnorderedMap<string, UnorderedSet<string>> = new UnorderedMap();
}

@Logic(NestedCollectionsDemo)
export class NestedCollectionsDemoLogic extends NestedCollectionsDemo {
  @Init
  static init(): NestedCollectionsDemo {
    env.log('Initializing nested collections demo');
    return new NestedCollectionsDemo();
  }

  // Now this works automatically without manual re-serialization!
  addReaction(messageId: string, emoji: string, userId: string): void {
    env.log(`Adding reaction ${emoji} from ${userId} to message ${messageId}`);
    
    // Get or create the reaction map for this message
    let reactionMap = this.messageReactions.get(messageId);
    if (!reactionMap) {
      reactionMap = new UnorderedMap<string, UnorderedSet<string>>();
      this.messageReactions.set(messageId, reactionMap);
    }

    // Get or create the user set for this emoji
    let userSet = reactionMap.get(emoji);
    if (!userSet) {
      userSet = new UnorderedSet<string>();
      reactionMap.set(emoji, userSet);
    }

    // Add the user - this change will now automatically propagate!
    userSet.add(userId);
    
    env.log(`Reaction added successfully`);
  }

  removeReaction(messageId: string, emoji: string, userId: string): void {
    const reactionMap = this.messageReactions.get(messageId);
    if (!reactionMap) return;

    const userSet = reactionMap.get(emoji);
    if (!userSet) return;

    // Remove the user - this change will automatically propagate!
    userSet.delete(userId);
    
    // Clean up empty sets
    if (userSet.size() === 0) {
      reactionMap.remove(emoji);
    }
  }

  addUserToGroup(groupName: string, userId: string): void {
    let group = this.userGroups.get(groupName);
    if (!group) {
      group = new UnorderedSet<string>();
      this.userGroups.set(groupName, group);
    }

    // This change will automatically propagate!
    group.add(userId);
  }

  @View()
  getReactions(messageId: string): string {
    const reactionMap = this.messageReactions.get(messageId);
    if (!reactionMap) {
      return JSON.stringify({});
    }

    const result: Record<string, string[]> = {};
    for (const [emoji, userSet] of reactionMap.entries()) {
      result[emoji] = userSet.toArray();
    }

    return JSON.stringify(result);
  }

  @View()
  getGroupMembers(groupName: string): string {
    const group = this.userGroups.get(groupName);
    return JSON.stringify(group ? group.toArray() : []);
  }

  @View()
  getAllGroups(): string {
    const result: Record<string, string[]> = {};
    for (const [groupName, userSet] of this.userGroups.entries()) {
      result[groupName] = userSet.toArray();
    }
    return JSON.stringify(result);
  }
}
