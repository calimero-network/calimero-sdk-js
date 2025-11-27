import { Event } from '@calimero-network/calimero-sdk-js';

@Event
export class MessageSent {
  constructor(
    public channelId: string,
    public messageId: string
  ) {}
}

@Event
export class MessageSentThread {
  constructor(
    public channelId: string,
    public parentId: string,
    public messageId: string
  ) {}
}

@Event
export class ReactionUpdated {
  constructor(public messageId: string) {}
}
