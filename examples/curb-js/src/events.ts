import { Event } from '@calimero-network/calimero-sdk-js';

import type { UserId, Username } from './types';

@Event
export class UserJoined {
  constructor(
    public userId: UserId,
    public username: Username
  ) {}
}
