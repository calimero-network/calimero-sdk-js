import { Event } from "@calimero/sdk";

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

