import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap, Counter } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class TeamMetrics {
  memberContributions: UnorderedMap<string, Counter>;
  totalContributions: Counter;

  constructor() {
    this.memberContributions = new UnorderedMap();
    this.totalContributions = new Counter();
  }
}

@Logic(TeamMetrics)
export class TeamMetricsLogic extends TeamMetrics {
  @Init
  static initialize(): TeamMetrics {
    env.log('Initializing team metrics');
    return new TeamMetrics();
  }

  addContribution(member: string, points: number): void {
    env.log(`Adding ${points} points for ${member}`);

    // Get or create member counter
    let memberCounter = this.memberContributions.get(member);
    if (!memberCounter) {
      memberCounter = new Counter();
      this.memberContributions.set(member, memberCounter);
    }

    // Increment member counter
    for (let i = 0; i < points; i++) {
      memberCounter.increment();
    }

    // Increment total counter
    for (let i = 0; i < points; i++) {
      this.totalContributions.increment();
    }
  }

  getMemberMetrics(member: string): bigint {
    const counter = this.memberContributions.get(member);
    return counter ? counter.value() : 0n;
  }

  getTotalContributions(): bigint {
    return this.totalContributions.value();
  }
}

