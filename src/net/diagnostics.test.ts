import { describe, expect, it } from "vitest";
import {
  advise,
  classifyJoinError,
  formatReport,
  networkVerdict,
  parseCandidate,
  summarizeCandidates,
  type Candidate,
  type ConnectionFacts,
  type NetworkCheck,
} from "./diagnostics";

const LOCAL_PORT = 54400;
const OTHER_PORT = 61000;
const THIRD_PORT = 61001;
const TURN_PORT = 3478;
const SLOW_AFTER = 20;
const JUST_UNDER = 19.9;
const PUBLIC_IP = "203.0.113.5";

const HOST_LINE = `candidate:1 1 udp 2122260223 4f1c9a.local ${String(LOCAL_PORT)} typ host generation 0`;
const SRFLX_LINE = `candidate:2 1 UDP 1686052607 ${PUBLIC_IP} ${String(LOCAL_PORT)} typ srflx raddr 0.0.0.0 rport 0`;
const RELAY_LINE = `candidate:3 1 udp 41885439 198.51.100.7 ${String(TURN_PORT)} typ relay raddr ${PUBLIC_IP} rport ${String(LOCAL_PORT)}`;
const TCP_LINE = "candidate:4 1 tcp 1518280447 4f1c9a.local 9 typ host tcptype active";

function srflx(port: number, address = PUBLIC_IP): Candidate {
  return { kind: "srflx", protocol: "udp", address, port };
}
const HOST: Candidate = {
  kind: "host",
  protocol: "udp",
  address: "4f1c9a.local",
  port: LOCAL_PORT,
};

const GOOD_NETWORK: NetworkCheck = {
  local: true,
  publicAddress: true,
  relay: false,
  mapping: "steady",
};

function facts(overrides: Partial<ConnectionFacts> = {}): ConnectionFacts {
  return {
    relays: { open: 3, connecting: 0, total: 5 },
    network: null,
    trouble: null,
    waitingSeconds: 0,
    slowAfterSeconds: SLOW_AFTER,
    ...overrides,
  };
}

describe("parseCandidate", () => {
  it("reads host, server-reflexive, relay and tcp candidates", () => {
    expect(parseCandidate(HOST_LINE)).toEqual(HOST);
    expect(parseCandidate(SRFLX_LINE)).toEqual(srflx(LOCAL_PORT));
    expect(parseCandidate(RELAY_LINE)?.kind).toBe("relay");
    expect(parseCandidate(TCP_LINE)?.protocol).toBe("tcp");
  });

  it("accepts the SDP attribute form", () => {
    expect(parseCandidate(`a=${HOST_LINE}`)).toEqual(HOST);
  });

  it.each([
    ["empty", ""],
    ["not a candidate", "a=mid:0"],
    ["unknown type", "candidate:1 1 udp 1 1.2.3.4 5 typ weird"],
    ["unknown protocol", "candidate:1 1 sctp 1 1.2.3.4 5 typ host"],
    ["missing typ", "candidate:1 1 udp 1 1.2.3.4 5 kind host"],
    ["port not a number", "candidate:1 1 udp 1 1.2.3.4 x typ host"],
    ["too short", "candidate:1 1 udp"],
  ])("rejects a malformed line: %s", (_name, line) => {
    expect(parseCandidate(line)).toBeNull();
  });
});

describe("summarizeCandidates", () => {
  it("finds nothing when WebRTC gathered nothing", () => {
    expect(summarizeCandidates([])).toEqual({
      local: false,
      publicAddress: false,
      relay: false,
      mapping: "unknown",
    });
  });

  it("sees no public address when STUN never answered", () => {
    expect(summarizeCandidates([HOST])).toEqual({
      local: true,
      publicAddress: false,
      relay: false,
      mapping: "unknown",
    });
  });

  it("calls one public port per local socket steady", () => {
    expect(summarizeCandidates([HOST, srflx(LOCAL_PORT)]).mapping).toBe("steady");
  });

  it("calls more public ports than local sockets a strict router", () => {
    expect(summarizeCandidates([HOST, srflx(OTHER_PORT), srflx(THIRD_PORT)]).mapping).toBe(
      "changes",
    );
  });

  it("allows one public port per local socket when there are several", () => {
    const second: Candidate = { ...HOST, address: "9e2b.local" };
    expect(summarizeCandidates([HOST, second, srflx(OTHER_PORT), srflx(THIRD_PORT)]).mapping).toBe(
      "steady",
    );
  });

  it("notices a TURN relay", () => {
    const relay = parseCandidate(RELAY_LINE);
    expect(relay).not.toBeNull();
    expect(summarizeCandidates(relay === null ? [] : [relay]).relay).toBe(true);
  });
});

describe("classifyJoinError", () => {
  it("tells a failed direct connection from a refusal", () => {
    const failed = "could not connect to peer abc after exchanging SDP; configure TURN servers";
    expect(classifyJoinError(failed).kind).toBe("unreachable");
    expect(classifyJoinError("incorrect room password when decrypting offer").kind).toBe("refused");
  });
});

describe("advise", () => {
  it("says nothing when nothing looks wrong", () => {
    expect(advise(facts({ network: GOOD_NETWORK }))).toEqual([]);
  });

  it("asks for an internet check when no relay is reachable", () => {
    const relays = { open: 0, connecting: 0, total: 5 };
    expect(advise(facts({ relays }))[0]).toMatch(/matchmaking server/);
  });

  it("stays quiet about relays the transport has not opened yet", () => {
    expect(advise(facts({ relays: { open: 0, connecting: 0, total: 0 } }))).toEqual([]);
  });

  it("stays quiet while relays are still connecting", () => {
    expect(advise(facts({ relays: { open: 0, connecting: 2, total: 5 } }))).toEqual([]);
  });

  it("explains a failed direct connection", () => {
    const trouble = classifyJoinError("could not connect to peer x after exchanging SDP");
    expect(advise(facts({ trouble }))[0]).toMatch(/networks wouldn't connect/);
  });

  it("explains a refusal", () => {
    expect(advise(facts({ trouble: { kind: "refused", detail: "" } }))[0]).toMatch(/turned/);
  });

  it("explains a browser that blocks WebRTC", () => {
    const network: NetworkCheck = { ...GOOD_NETWORK, local: false, publicAddress: false };
    expect(advise(facts({ network }))[0]).toMatch(/isn't allowed/);
  });

  it("explains a network with no public address", () => {
    const network: NetworkCheck = { ...GOOD_NETWORK, publicAddress: false, mapping: "unknown" };
    expect(advise(facts({ network }))[0]).toMatch(/same Wi-Fi/);
  });

  it("does not claim no public address when a TURN relay answered", () => {
    const network: NetworkCheck = { ...GOOD_NETWORK, publicAddress: false, relay: true };
    expect(advise(facts({ network }))).toEqual([]);
  });

  it("explains a strict router", () => {
    const network: NetworkCheck = { ...GOOD_NETWORK, mapping: "changes" };
    expect(advise(facts({ network }))[0]).toMatch(/strict/);
  });

  it("starts 'still looking' advice exactly at the slow mark", () => {
    expect(advise(facts({ waitingSeconds: JUST_UNDER }))).toEqual([]);
    expect(advise(facts({ waitingSeconds: SLOW_AFTER }))[0]).toMatch(/Still looking/);
  });

  it("drops 'still looking' once there is a real problem to explain", () => {
    const trouble = classifyJoinError("could not connect to peer x");
    expect(advise(facts({ trouble, waitingSeconds: SLOW_AFTER }))).toHaveLength(1);
  });
});

describe("networkVerdict", () => {
  it("answers every outcome of the network check", () => {
    expect(networkVerdict(GOOD_NETWORK)).toMatch(/looks fine/);
    expect(networkVerdict({ ...GOOD_NETWORK, mapping: "changes" })).toMatch(/strict/);
    expect(networkVerdict({ ...GOOD_NETWORK, publicAddress: false })).toMatch(/no public/);
  });
});

describe("formatReport", () => {
  it("lists context, relays, trouble, the network check and advice", () => {
    const report = formatReport(
      facts({
        network: { ...GOOD_NETWORK, mapping: "changes" },
        trouble: { kind: "unreachable", detail: "could not connect to peer p1" },
        waitingSeconds: SLOW_AFTER,
      }),
      { role: "guest" },
    );
    expect(report.split("\n")).toEqual([
      "role: guest",
      "relays open: 3 of 5",
      "waiting: 20 s",
      "trouble: unreachable (could not connect to peer p1)",
      "webrtc: yes",
      "public address (stun): yes",
      "turn relay: no",
      "nat mapping: changes",
      expect.stringMatching(/^advice: Found your friend/),
      expect.stringMatching(/^advice: This network's router looks strict/),
    ]);
  });

  it("says when the network check has not run", () => {
    expect(formatReport(facts(), {})).toContain("network check: not run");
  });
});
