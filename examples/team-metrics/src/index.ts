import { State, Logic, Init, View, Mergeable } from '@calimero-network/calimero-sdk-js';
import { UnorderedMap, Counter, Vector } from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

class ContributionNoteRecord {
  message: string = '';
  timestamp: bigint = 0n;
}

@Mergeable({
  merge: (local, remote) => {
    const resolved = new MemberProfileRecord();
    resolved.displayName = remote.displayName ?? local.displayName;

    resolved.roles = mergeVectorOfStrings(local.roles, remote.roles);
    resolved.contributions = mergeCounter(local.contributions, remote.contributions);
    resolved.recentNotes = mergeVectorOfNotes(local.recentNotes, remote.recentNotes);

    return resolved;
  },
})
class MemberProfileRecord {
  displayName: string = '';
  roles: Vector<string> = new Vector<string>();
  contributions: Counter = new Counter();
  recentNotes: Vector<ContributionNoteRecord> = new Vector<ContributionNoteRecord>();
}

export type MemberProfile = {
  displayName: string;
  roles: string[];
  contributions: bigint;
  recentNotes: ContributionNoteRecord[];
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

  setMemberProfile(
    memberOrPayload: string | { member: string; displayName: string; roles?: string[] },
    maybeDisplayName?: string,
    maybeRoles?: string[]
  ): void {
    const { member, displayName, roles } = normalizeMemberProfileArgs(
      memberOrPayload,
      maybeDisplayName,
      maybeRoles
    );
    const existing = this.memberProfiles.get(member);

    if (existing) {
      existing.displayName = displayName;
      if (roles) {
        existing.roles = Vector.fromArray(roles);
      }
      const counter = this.memberContributions.get(member);
      if (counter && existing.contributions !== counter) {
        existing.contributions = counter;
      }
      this.memberProfiles.set(member, existing);
      return;
    }

    let counter = this.memberContributions.get(member);
    if (!counter) {
      counter = new Counter();
      this.memberContributions.set(member, counter);
    }

    this.memberProfiles.set(member, createProfileRecord(member, displayName, roles, counter));
  }

  addContribution(
    payloadOrMember: string | { member: string; points: number; note?: string },
    maybePoints?: number,
    maybeNote?: string
  ): void {
    const { member, points, note } = normalizeContributionArgs(
      payloadOrMember,
      maybePoints,
      maybeNote
    );
    env.log(`Adding ${points} points for ${member}`);
    env.log(`addContribution payload member=${member}, points=${points} (type=${typeof points})`);

    let memberCounter = this.memberContributions.get(member);
    if (!memberCounter) {
      memberCounter = new Counter();
      this.memberContributions.set(member, memberCounter);
    }

    const increments = normalizePoints(points);
    memberCounter.incrementBy(increments);
    this.memberContributions.set(member, memberCounter);
    this.totalContributions.incrementBy(increments);

    env.log(`Member ${member} counter now ${memberCounter.value().toString()}`);

    const profile =
      this.memberProfiles.get(member) ??
      createProfileRecord(member, undefined, undefined, memberCounter);
    if (profile.contributions !== memberCounter) {
      profile.contributions = memberCounter;
    }

    if (note) {
      const entry = new ContributionNoteRecord();
      entry.message = note;
      entry.timestamp = BigInt(Date.now());
      profile.recentNotes.push(entry);
    }

    this.memberProfiles.set(member, profile);
  }

  @View()
  getMemberMetrics(memberOrPayload: string | { member: string }): bigint {
    const member = typeof memberOrPayload === 'string' ? memberOrPayload : memberOrPayload.member;
    const counter = this.memberContributions.get(member);
    if (!counter) {
      env.log(`Member ${member} counter missing in map`);
      return 0n;
    }

    const value = counter.value();
    env.log(`Member ${member} counter reported value ${value.toString()}`);
    return value;
  }

  @View()
  getTotalContributions(): bigint {
    return this.totalContributions.value();
  }

  @View()
  getMemberProfile(memberOrPayload: string | { member: string }): MemberProfile | null {
    const member = typeof memberOrPayload === 'string' ? memberOrPayload : memberOrPayload.member;
    const profile = this.memberProfiles.get(member);
    if (!profile) {
      return null;
    }

    return {
      displayName: profile.displayName,
      roles: profile.roles.toArray(),
      contributions: profile.contributions.value(),
      recentNotes: profile.recentNotes.toArray(),
    };
  }
}

const createProfileRecord = (
  member: string,
  displayName?: string,
  roles?: string[],
  contributions?: Counter
): MemberProfileRecord => {
  const profile = new MemberProfileRecord();
  profile.displayName = displayName ?? member;
  profile.roles = Vector.fromArray(roles ?? []);
  profile.contributions = contributions ?? new Counter();
  profile.recentNotes = new Vector<ContributionNoteRecord>();
  return profile;
};

function mergeCounter(local: Counter, remote: Counter): Counter {
  const localValue = local.value();
  const remoteValue = remote.value();
  return remoteValue >= localValue ? remote : local;
}

function mergeVectorOfStrings(local: Vector<string>, remote: Vector<string>): Vector<string> {
  const merged = Array.from(new Set([...local.toArray(), ...remote.toArray()]));
  return Vector.fromArray(merged);
}

function mergeVectorOfNotes(
  local: Vector<ContributionNoteRecord>,
  remote: Vector<ContributionNoteRecord>
): Vector<ContributionNoteRecord> {
  const combined = [...local.toArray(), ...remote.toArray()];
  combined.sort((a, b) => {
    if (a.timestamp === b.timestamp) {
      return a.message.localeCompare(b.message);
    }
    return a.timestamp < b.timestamp ? -1 : 1;
  });

  const seen = new Set<string>();
  const deduped: ContributionNoteRecord[] = [];
  for (const note of combined) {
    const key = `${note.timestamp.toString()}-${note.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const copy = new ContributionNoteRecord();
    copy.message = note.message;
    copy.timestamp = note.timestamp;
    deduped.push(copy);
  }

  return Vector.fromArray(deduped);
}

function normalizeContributionArgs(
  payloadOrMember: string | { member: string; points: number; note?: string },
  maybePoints?: number,
  maybeNote?: string
): { member: string; points: number; note?: string } {
  if (typeof payloadOrMember === 'object' && payloadOrMember !== null) {
    return {
      member: payloadOrMember.member,
      points: payloadOrMember.points,
      note: payloadOrMember.note,
    };
  }

  return {
    member: payloadOrMember,
    points: maybePoints ?? 0,
    note: maybeNote,
  };
}

function normalizeMemberProfileArgs(
  memberOrPayload: string | { member: string; displayName: string; roles?: string[] },
  maybeDisplayName?: string,
  maybeRoles?: string[]
): { member: string; displayName: string; roles?: string[] } {
  if (typeof memberOrPayload === 'object' && memberOrPayload !== null) {
    return {
      member: memberOrPayload.member,
      displayName: memberOrPayload.displayName,
      roles: memberOrPayload.roles,
    };
  }

  return {
    member: memberOrPayload,
    displayName: maybeDisplayName ?? memberOrPayload,
    roles: maybeRoles,
  };
}

const normalizePoints = (points: number): number => {
  if (!Number.isFinite(points) || !Number.isInteger(points) || points < 0) {
    throw new RangeError('Contribution points must be a non-negative integer');
  }
  return points;
};
