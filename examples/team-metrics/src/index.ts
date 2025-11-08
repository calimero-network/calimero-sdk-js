import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap, Counter, Vector } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

type ContributionNote = {
  message: string;
  timestamp: bigint;
};

type MemberProfileRecord = {
  displayName: string;
  roles: Vector<string>;
  contributions: bigint;
  recentNotes: Vector<ContributionNote>;
};

export type MemberProfile = {
  displayName: string;
  roles: string[];
  contributions: bigint;
  recentNotes: ContributionNote[];
};

type ContributionPayload = {
  member: string;
  points: number;
  note?: string;
};

type MemberProfileInput = {
  member: string;
  displayName: string;
  roles?: string[];
};

@State
export class TeamMetrics {
  memberContributions: UnorderedMap<string, Counter>;
  totalContributions: Counter;
  memberProfiles: UnorderedMap<string, MemberProfileRecord>;

  constructor() {
    this.memberContributions = new UnorderedMap();
    this.totalContributions = new Counter();
    this.memberProfiles = new UnorderedMap();
  }
}

@Logic(TeamMetrics)
export class TeamMetricsLogic extends TeamMetrics {
  @Init
  static init(): TeamMetrics {
    env.log('Initializing team metrics');
    return new TeamMetrics();
  }

  setMemberProfile({ member, displayName, roles }: MemberProfileInput): void {
    const existing = this.memberProfiles.get(member);

    if (existing) {
      existing.displayName = displayName;
      if (roles) {
        existing.roles = Vector.fromArray(roles);
      }
      this.memberProfiles.set(member, existing);
      return;
    }

    this.memberProfiles.set(member, createProfileRecord(member, displayName, roles));
  }

  addContribution({ member, points, note }: ContributionPayload): void {
    env.log(`Adding ${points} points for ${member}`);

    // Get or create member counter
    let memberCounter = this.memberContributions.get(member);
    if (!memberCounter) {
      memberCounter = new Counter();
      this.memberContributions.set(member, memberCounter);
    }

    const increments = normalizePoints(points);
    memberCounter.incrementBy(increments);
    this.totalContributions.incrementBy(increments);

    // Update member profile struct
    const profile = this.memberProfiles.get(member) ?? createProfileRecord(member);

    profile.contributions += BigInt(increments);
    if (note) {
      const entry: ContributionNote = {
        message: note,
        timestamp: BigInt(Date.now())
      };
      profile.recentNotes.push(entry);
    }

    this.memberProfiles.set(member, profile);
  }

  getMemberMetrics({ member }: { member: string }): bigint {
    const profile = this.memberProfiles.get(member);
    return profile ? profile.contributions : 0n;
  }

  getTotalContributions(): bigint {
    return this.totalContributions.value();
  }

  getMemberProfile({ member }: { member: string }): MemberProfile | null {
    const profile = this.memberProfiles.get(member);
    if (!profile) {
      return null;
    }

    return {
      displayName: profile.displayName,
      roles: profile.roles.toArray(),
      contributions: profile.contributions,
      recentNotes: profile.recentNotes.toArray()
    };
  }
}

const createProfileRecord = (member: string, displayName?: string, roles?: string[]): MemberProfileRecord => ({
  displayName: displayName ?? member,
  roles: Vector.fromArray(roles ?? []),
  contributions: 0n,
  recentNotes: new Vector<ContributionNote>()
});

const normalizePoints = (points: number): number => {
  if (!Number.isFinite(points) || !Number.isInteger(points) || points < 0) {
    throw new RangeError('Contribution points must be a non-negative integer');
  }
  return points;
};

