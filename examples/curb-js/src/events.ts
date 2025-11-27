import { Event } from "@calimero/sdk";

import type { UserId, Username } from "./types";

@Event
export class UserJoined {
  constructor(public userId: UserId, public username: Username) {}
}

