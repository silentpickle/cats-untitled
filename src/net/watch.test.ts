import { describe, expect, it } from "vitest";
import { MemoryHub, settle } from "./memoryRoom";
import { ConnectionWatch } from "./watch";

const SLOW_AFTER = 20;
const LATER_MS = 2500;
const LATER_SECONDS = 2.5;

describe("ConnectionWatch", () => {
  it("collects relays, elapsed time and trouble the room reports", async () => {
    const hub = new MemoryHub();
    let clock = 0;
    const watch = new ConnectionWatch(hub.join("guest"), {
      slowAfterSeconds: SLOW_AFTER,
      now: () => clock,
    });
    let changes = 0;
    watch.onChange(() => {
      changes += 1;
    });
    clock = LATER_MS;
    hub.reportTrouble("guest", { kind: "unreachable", detail: "no route" });
    await settle();
    expect(watch.facts()).toEqual({
      relays: { open: 1, connecting: 0, total: 1 },
      network: null,
      trouble: { kind: "unreachable", detail: "no route" },
      waitingSeconds: LATER_SECONDS,
      slowAfterSeconds: SLOW_AFTER,
    });
    expect(changes).toBe(1);
  });

  it("records the network check and says so", () => {
    const hub = new MemoryHub();
    const watch = new ConnectionWatch(hub.join("host"), { slowAfterSeconds: SLOW_AFTER });
    let changed = false;
    watch.onChange(() => {
      changed = true;
    });
    const check = { local: true, publicAddress: true, relay: false, mapping: "steady" } as const;
    watch.noteNetwork(check);
    expect(watch.facts().network).toEqual(check);
    expect(changed).toBe(true);
  });
});
