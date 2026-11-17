import type { MessageHandler, NetChannel, NetRoom, NetTrouble, RelayCount } from "./room";

/**
 * Rooms that live in one page, for tests and local play-testing. Every message goes through JSON like it
 * would on the wire, and arrives on a later microtask, so code that works here does not depend on
 * same-tick delivery.
 */

interface Member {
  readonly id: string;
  readonly channels: Map<string, MessageHandler>;
  joinHandler: (peerId: string) => void;
  leaveHandler: (peerId: string) => void;
  troubleHandler: (trouble: NetTrouble) => void;
}

/** A memory room has one perfect "relay": the hub. */
const MEMORY_RELAYS: RelayCount = { open: 1, connecting: 0, total: 1 };

function later(task: () => void): void {
  queueMicrotask(task);
}

function ignorePeer(): void {
  // Nobody is listening yet.
}

function ignoreTrouble(): void {
  // Nobody is listening yet.
}

/** One shared space; each `join` is a separate browser in the same room. */
export class MemoryHub {
  private readonly members = new Map<string, Member>();

  join(peerId: string): NetRoom {
    const member: Member = {
      id: peerId,
      channels: new Map(),
      joinHandler: ignorePeer,
      leaveHandler: ignorePeer,
      troubleHandler: ignoreTrouble,
    };
    const others = [...this.members.values()];
    this.members.set(peerId, member);
    later(() => {
      this.announce(member, others);
    });
    return this.roomFor(member);
  }

  /** Makes the room of `peerId` report a connection problem, as a real transport would. */
  reportTrouble(peerId: string, trouble: NetTrouble): void {
    const member = this.members.get(peerId);
    if (member === undefined) {
      return;
    }
    later(() => {
      member.troubleHandler(trouble);
    });
  }

  private announce(member: Member, others: readonly Member[]): void {
    for (const other of others) {
      if (!this.members.has(other.id)) {
        continue;
      }
      other.joinHandler(member.id);
      member.joinHandler(other.id);
    }
  }

  private deliver(from: Member, name: string, data: unknown, to: string | undefined): void {
    const wire = JSON.stringify(data);
    for (const member of this.members.values()) {
      if (member === from || (to !== undefined && member.id !== to)) {
        continue;
      }
      later(() => {
        member.channels.get(name)?.(JSON.parse(wire), from.id);
      });
    }
  }

  private remove(member: Member): void {
    if (!this.members.delete(member.id)) {
      return;
    }
    for (const other of this.members.values()) {
      later(() => {
        other.leaveHandler(member.id);
      });
    }
  }

  private roomFor(member: Member): NetRoom {
    const channel = (name: string): NetChannel => ({
      send: (data, to) => {
        this.deliver(member, name, data, to);
      },
      onMessage: (handler) => {
        member.channels.set(name, handler);
      },
    });
    return {
      selfId: member.id,
      channel,
      onPeerJoin: (handler) => {
        member.joinHandler = handler;
      },
      onPeerLeave: (handler) => {
        member.leaveHandler = handler;
      },
      onTrouble: (handler) => {
        member.troubleHandler = handler;
      },
      relays: () => MEMORY_RELAYS,
      leave: () => {
        this.remove(member);
      },
    };
  }
}

/** Resolves once every message and join already queued has been delivered. */
export function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
