import { Event } from '@calimero-network/calimero-sdk-js';

@Event
export class DMCreated {
  constructor(public contextId: string) {}
}

@Event
export class NewIdentityUpdated {
  constructor(public userId: string) {}
}

@Event
export class DMDeleted {
  constructor(public actorId: string) {}
}
