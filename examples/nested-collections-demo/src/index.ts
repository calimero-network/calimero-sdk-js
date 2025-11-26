import { State, Logic, Init, View } from '@calimero/sdk';
import { UnorderedMap, UnorderedSet } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class NestedCollectionsDemo {
  messageReactions: UnorderedMap<string, UnorderedMap<string, UnorderedSet<string>>>;
  userGroups: UnorderedMap<string, UnorderedSet<string>>;

  constructor() {
    this.messageReactions = new UnorderedMap();
    this.userGroups = new UnorderedMap();
  }
}

@Logic(NestedCollectionsDemo)
export class NestedCollectionsDemoLogic extends NestedCollectionsDemo {
  @Init
  static init(): NestedCollectionsDemo {
    env.log('Initializing nested collections demo');
    return new NestedCollectionsDemo();
  }

  // Now this works automatically without manual re-serialization!
  addReaction(args: { messageId: string; emoji: string; userId: string }): void {
    const messageId = args.messageId;
    const emoji = args.emoji;
    const userId = args.userId;
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

    // Add the user - changes automatically propagate thanks to nested tracking!
    userSet.add(userId);
    
    env.log(`Reaction added successfully`);
  }

  removeReaction(args: { messageId: string; emoji: string; userId: string }): void {
    const messageId = args.messageId;
    const emoji = args.emoji;
    const userId = args.userId;
    const reactionMap = this.messageReactions.get(messageId);
    if (!reactionMap) return;

    const userSet = reactionMap.get(emoji);
    if (!userSet) return;

    // Remove the user - changes automatically propagate thanks to nested tracking!
    userSet.delete(userId);
    
    // Clean up empty sets
    if (userSet.size() === 0) {
      reactionMap.remove(emoji);
    }
  }

  addUserToGroup(args: { groupName: string; userId: string }): void {
    const groupName = args.groupName;
    const userId = args.userId;
    env.log(`Adding user ${userId} to group ${groupName}`);
    let group = this.userGroups.get(groupName);
    env.log(`Retrieved group: ${group ? 'exists' : 'null'}, type: ${typeof group}`);
    if (!group) {
      group = new UnorderedSet<string>();
      env.log(`Created new UnorderedSet for group ${groupName}`);
      this.userGroups.set(groupName, group);
    }

    // Add user - changes automatically propagate thanks to nested tracking!
    group.add(userId);
    env.log(`Added ${userId} to group, group now has ${group.size()} members`);
  }

  @View()
  getReactions(arg1: { messageId: string } | string): string {
    const messageId = typeof arg1 === 'string' ? arg1 : arg1.messageId;
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
  getGroupMembers(arg1: { groupName: string } | string): string {
    const groupName = typeof arg1 === 'string' ? arg1 : arg1.groupName;
    const group = this.userGroups.get(groupName);
    return JSON.stringify(group ? group.toArray() : []);
  }

  @View()
  getAllGroups(): string {
    env.log(`getAllGroups called, userGroups has ${this.userGroups.keys().length} keys`);
    const result: Record<string, string[]> = {};
    for (const [groupName, userSet] of this.userGroups.entries()) {
      env.log(`Processing group: ${groupName}, userSet type: ${typeof userSet}, constructor: ${userSet?.constructor?.name}`);
      if (userSet && typeof userSet.toArray === 'function') {
        result[groupName] = userSet.toArray();
      } else {
        env.log(`userSet is not a proper UnorderedSet: ${JSON.stringify(userSet)}`);
        result[groupName] = [];
      }
    }
    return JSON.stringify(result);
  }
}
