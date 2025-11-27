import { Event } from '@calimero-network/calimero-sdk-js';

import type { ChannelId, UserId } from '../types';
import { ChannelType } from './types';

@Event
export class ChannelCreated {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId,
    public channelType: ChannelType
  ) {}
}

@Event
export class ChannelDeleted {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId
  ) {}
}

@Event
export class ChannelJoined {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId
  ) {}
}

@Event
export class ChannelLeft {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId
  ) {}
}

@Event
export class ChannelInvited {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId,
    public targetId: UserId
  ) {}
}

@Event
export class ChannelUninvited {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId,
    public targetId: UserId
  ) {}
}

@Event
export class ChannelModeratorPromoted {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId,
    public targetId: UserId
  ) {}
}

@Event
export class ChannelModeratorDemoted {
  constructor(
    public channelId: ChannelId,
    public actorId: UserId,
    public targetId: UserId
  ) {}
}
