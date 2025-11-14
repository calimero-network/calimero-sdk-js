import { Event } from "@calimero/sdk";

import type { ChannelId, UserId } from "../types";
import { ChannelType } from "./types";

@Event
export class ChannelCreated {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId,
    public channelType: ChannelType,
  ) {}

  serialize(): string {
    return JSON.stringify({
      channelId: this.channelId,
      actorId: this.actorId,
      channelType: this.channelType,
    });
  }
}

@Event
export class ChannelDeleted {
  constructor(public channelId: ChannelId, public actorId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

@Event
export class ChannelJoined {
  constructor(public channelId: ChannelId, public actorId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

@Event
export class ChannelLeft {
  constructor(public channelId: ChannelId, public actorId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

@Event
export class ChannelInvited {
  constructor(public channelId: ChannelId, public actorId: UserId, public targetId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

@Event
export class ChannelUninvited {
  constructor(public channelId: ChannelId, public actorId: UserId, public targetId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

@Event
export class ChannelModeratorPromoted {
  constructor(public channelId: ChannelId, public actorId: UserId, public targetId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

@Event
export class ChannelModeratorDemoted {
  constructor(public channelId: ChannelId, public actorId: UserId, public targetId: UserId) {}

  serialize(): string {
    return JSON.stringify(this);
  }
}

