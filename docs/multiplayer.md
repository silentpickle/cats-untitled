# Multiplayer with room codes, no server

Two people play together from a static web page. One opens a room and gets a short code (`K7QX`) and an
invite link; the other types the code or opens the link. There is no backend to run, deploy or pay for.

This document covers how it works, how it is built here, and how to lift it into another project.

## The short version

- **Library:** [Trystero](https://github.com/dmotz/trystero), pinned to `0.27.0`. MIT licence, free.
- **Matchmaking:** Trystero uses public Nostr relays to introduce the two browsers. We run nothing and need no
  account. The relays only see a hashed room id and connection details.
- **Game traffic:** browser to browser over WebRTC. It never touches the relays once connected.
- **Model:** host-authoritative. The host runs the game and sends snapshots; the guest sends its input.
- **Smoothing:** the guest draws the other cat a little in the past, blended between snapshots, and moves
  its own cat at once by running the host's movement rule locally (see [Hiding the lag](#hiding-the-lag)).
- **Cost:** nothing. GitHub Pages hosts the page; Trystero and the relays are free.

## Trade-offs to know about

| Issue                                    | What happens                                                              | What to do                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Strict networks (some offices, carriers) | The direct connection fails; the lobby says so and opens its help panel   | Add a TURN relay (see [Adding a TURN relay](#adding-a-turn-relay)). Free tiers exist.       |
| Public relays have no uptime guarantee   | Rarely, matchmaking is slow or fails                                      | Trystero tries several relays at once. Try again, or pass your own relay list.              |
| The host's page is the game              | If the host closes the tab or loses Wi-Fi, the round ends for the guest   | The guest sees "Connection lost". If the guest leaves, the computer takes over on the host. |
| Background tabs are throttled            | A host tab in the background (or a locked phone) nearly stops the game    | The host keeps the game in front. Same for the guest's input.                               |
| IP addresses                             | Each player's IP address is visible to the other, as with any direct link | Fine between friends. Do not post room codes publicly.                                      |
| The host could cheat                     | The host's browser runs the rules                                         | Fine for friends. Competitive play would need a server.                                     |
| Room codes are short                     | About a million 4-character codes; someone could guess an open one        | Only the first guest is accepted; anyone else is told the room is full. Lengthen the code.  |

## How a game connects

```
 Host browser                       Public Nostr relays                    Guest browser
 ────────────                       ───────────────────                    ─────────────
 makeRoomCode() -> "K7QX"
 joinRoom(appId, "K7QX") ───────────► "who else is in K7QX?" ◄──────────── joinRoom(appId, "K7QX")
                    ◄─────────── WebRTC offer/answer swapped via relays ───────────►
 ════════════════════════════ direct peer-to-peer connection ═════════════════════════════
 onPeerJoin(guest)
   ctl: hello {protocol, welcome: {cat}} ──────────────────────────────────►  check protocol
                                                                               onWelcome({cat})
   ◄──────────────────────────────────────────────────────── ctl: join {protocol}
 status "connected", round starts                                           status "connected"

 every frame: run the rules
 20×/s  state: {time, ack, state: whole GameState + events since last} ───►  buffer, blend, play sounds
                ◄────────────────────────────────── input: {seq, input: {move, swat, stealth}}  30×/s
```

The handshake is two messages so that a stray peer cannot take the seat: the host only accepts a peer that
answered its `hello` with the right protocol version, and it only accepts one. A third peer gets `full`.
Messages from anyone but the partner are ignored on both sides.

## How the code is split

```
src/net/          Game-agnostic. Nothing here imports the game. Copy this folder to reuse it.
  room.ts           NetRoom / NetChannel / JoinRoom: the transport seam.
  trysteroRoom.ts   The only file that imports Trystero.
  trysteroErrors.ts Trystero's room error codes -> what the player is told.
  memoryRoom.ts     An in-page NetRoom for tests (MemoryHub, settle).
  session.ts        HostSession / GuestSession: handshake, seats, status, decoding, input seq and acks.
  snapshotBuffer.ts SnapshotBuffer: plays snapshots back a little late, with its own smooth clock.
  lag.ts            withLag / lagFromUrl: fake latency and jitter for testing on one computer.
  roomCode.ts       Codes, normalising typed codes, invite links.
  rate.ts           SendRate: "send N times a second, whatever the frame rate".
  diagnostics.ts    Troubleshooting, pure: parse ICE candidates, spot strict NATs, advice, reports.
  probe.ts          The network check: gathers ICE candidates from the STUN servers. Browser only.
  watch.ts          ConnectionWatch: relays, transport trouble and elapsed time for one room.

src/netplay/      This game's glue. Knows about cats; uses src/net.
  protocol.ts       PROTOCOL_VERSION, the Welcome message (which cat the guest plays).
  wire.ts           Decoders for GameState and CatInput: everything off the network is checked.
  hostMatch.ts      Runs the round locally and sends snapshots; the guest's input drives the other cat.
  guestMatch.ts     Blends snapshots, predicts its own cat, sends input; never runs the other rules.
  interpolate.ts    interpolateState: a GameState part-way between two snapshots.
  predict.ts        OwnCatPredictor: the guest's own cat, moved at once and corrected toward the host.
  lobby.ts          The "Play with a friend" screen, including the "Trouble connecting?" panel.
  online.ts         Turns session status into rounds and messages.
  troubleshooter.ts Keeps the help panel current while a room waits for its second player.

src/play/localMatch.ts   The fixed-step loop. Solo and host both use it; the guest swaps in GuestMatch.
```

The game loop in `src/main.ts` talks to one interface, `Match`: `advance(dt, readMyInput)` returns the
events that happened, and `state` is what to draw. Solo is a `LocalMatch` with the computer as rival; the
host is a `HostMatch` wrapping a `LocalMatch` whose rival is the guest's input; the guest is a `GuestMatch`.
The renderer, HUD and sounds do not know which one they are looking at.

Settings live in `config.toml` under `[net]`: the app id, room code length, the two send rates, the STUN
servers, and the troubleshooting timings.

## Reusing it in another project

1. **Copy `src/net/`** and add the dependency, pinned:

   ```bash
   pnpm add -E trystero@0.27.0
   ```

2. **Pick an app id** that is unique to your game. It keeps your rooms apart from every other Trystero app
   using the same code.

3. **Write decoders** for what crosses the wire. They take `unknown` and return your type or `null`. Rebuild
   the object from known fields only; reject anything non-finite or of the wrong kind. `src/netplay/wire.ts`
   is a worked example with small composable helpers.

4. **Host:**

   ```ts
   import { HostSession, makeRoomCode, roomLink, trysteroJoiner, SendRate } from "./net";

   const joinRoom = trysteroJoiner({ appId: "my-game" });
   const code = makeRoomCode(4);
   const host = new HostSession<MyState, MyInput>({
     room: joinRoom(code),
     protocol: 1,
     welcome: { seat: "red" }, // anything JSON; tells the guest who it is
     decodeInput,
   });
   showToPlayer(code, roomLink(location.href, code));
   host.onStatus((status) => {
     if (status === "connected") startGame();
     if (status === "left") showMessage("Your friend left");
   });

   const snapshots = new SendRate(20);
   function frame(dt: number) {
     runGame(dt, { remote: host.latestInput() });
     // A clock that keeps rising across rounds: the guest drops snapshots that are not newer.
     if (snapshots.due(dt)) host.sendState(currentState(), performance.now() / 1000);
   }
   ```

5. **Guest:**

   ```ts
   import { GuestSession, normalizeRoomCode, roomFromUrl, trysteroJoiner, SendRate } from "./net";

   const code = roomFromUrl(location.href, 4) ?? normalizeRoomCode(typedText, 4);
   const guest = new GuestSession<MyState, MyInput, MyWelcome>({
     room: joinRoom(code),
     protocol: 1,
     decodeState,
     decodeWelcome,
   });
   guest.onWelcome(({ seat }) => startGame(seat));
   // Push on arrival: the buffer measures jitter from arrival times.
   const buffer = new SnapshotBuffer<MyState>({ delaySeconds: 0.1 });
   guest.onSnapshot((state, { time, ack }) => {
     buffer.push(time, state);
     reconcileMyPrediction(ack, state); // optional: see "Hiding the lag"
   });
   guest.onStatus((status) => {
     if (status === "full") showMessage("That room is full");
     if (status === "mismatch") showMessage("Reload the page to update");
     if (status === "left") showMessage("Connection lost");
   });

   const inputs = new SendRate(30);
   function frame(dt: number) {
     if (inputs.due(dt)) rememberPrediction(guest.sendInput(readInput())); // returns the input's seq
     const bracket = buffer.sample(); // null until the first snapshot
     if (bracket !== null) draw(blend(bracket.from, bracket.to, bracket.t));
   }
   ```

6. **Test without a network** using `MemoryHub`: each `hub.join(id)` is a separate browser, messages go
   through JSON like the real wire, and `await settle()` delivers everything queued.
   `hub.reportTrouble(id, trouble)` fakes a failed connection. See `src/net/session.test.ts` and
   `src/netplay/netplay.test.ts`.

7. **Show players what is wrong** (see [Troubleshooting](#troubleshooting)). Give the joiner your STUN
   list so the network check tests the same servers the game uses, then watch the room while it waits:

   ```ts
   import { ConnectionWatch, advise, checkNetwork, formatReport } from "./net";

   const stun = [{ urls: "stun:stun.l.google.com:19302" }];
   const joinRoom = trysteroJoiner({ appId: "my-game", stun });
   const room = joinRoom(code);
   const watch = new ConnectionWatch(room, { slowAfterSeconds: 20 });
   watch.onChange(() => showAdvice(advise(watch.facts())));
   // From a "Check my connection" button; rejects only if the browser blocks WebRTC.
   checkNetwork(stun, 5000).then((check) => watch.noteNetwork(check));
   copyToClipboard(formatReport(watch.facts(), { role: "guest" }));
   ```

   A transport of your own must implement `onTrouble` and `relays` on its `NetRoom`. A transport with no
   relays can return `{ open: 1, connecting: 0, total: 1 }`, as `MemoryHub` does.

### Design choices worth keeping

- **Send whole snapshots, not diffs.** A game state of a few kilobytes at 20 a second is nothing for a direct
  connection, and it removes a whole class of desync bugs. Switch to diffs only if snapshots get large.
- **Carry events with the snapshot.** The host collects every event since the last snapshot and sends them
  together, so the guest hears every sound even though it sees fewer frames.
- **Read input only when sending it.** A tap that lasts less than one send interval is held until the next
  send instead of being read and dropped in between.
- **Bump the protocol version** whenever the state, input or welcome shape changes. An old page and a new
  page then refuse each other with a clear message.
- **Stamp snapshots with host time and inputs with a sequence number.** The guest can then play snapshots
  back on a smooth clock, and knows which of its inputs a snapshot already includes.
- **Keep the transport behind `NetRoom`.** Trystero can be replaced (another Trystero strategy, PeerJS, a
  WebSocket server) by writing one function that returns a `NetRoom`; nothing else changes.

## Hiding the lag

With about 100 ms each way, a guest that simply drew each snapshot saw two problems: everything hopped 20
times a second (and in clumps, because a delayed packet holds back the ones behind it), and its own cat only
moved after a round trip. Two standard fixes, both on the guest only:

```
guest frame
  if an input is due: send it (seq n), remember where my cat was at seq n
  my cat     = predicted: moved now by the input just sent, using the host's own movement rule (moveOneCat)
  everything else = SnapshotBuffer.sample(): drawn ~0.1 s in the past, blended between the snapshots on
                    either side (interpolateState)
snapshot arrives {time, ack, state}
  buffer.push(time, state); play its events now
  compare where the host put my cat after input `ack` with where I had it then:
    under prediction_dead_zone_metres  -> ignore (input timing noise)
    over  prediction_snap_metres       -> jump (a swat, a new round)
    in between                         -> blend in at prediction_blend_per_second
  while the host says my cat is stunned or fleeing, follow the host instead of predicting
```

- **Interpolation delay.** `interpolation_delay_seconds` (0.1, two snapshots at 20 a second) is the base;
  the buffer adds up to 0.25 s more when arrivals are uneven, and speeds its clock up or slows it down by at
  most 10% to stay on target, so the picture never jumps back.
- **Why a dead zone.** A snapshot that acks input `n` was taken after the host had used input `n` for up to
  one snapshot interval, so even a perfect prediction is off by up to speed × (1/20 + 1/30) s, about 0.25 m
  for Arwen. Smaller gaps are not real disagreements.
- **The cost.** The other cat is shown about 0.3 s late at 200 ms latency (lag plus the delay), so a swat
  lands on where Arwen was, not where she looks. Fine for a casual game; competitive games add lag
  compensation on the host.
- **Events play on arrival**, a little ahead of the blended picture. Nobody notices for sounds.

Trystero 0.27 has no real-time features of its own (its `makeState` is for lobby-style shared values, at
most 25 updates a second), and every message, ours included, goes over one reliable, ordered data channel.
That is why a lost packet holds back later snapshots; the buffer's jitter allowance absorbs it. A lossy
channel opened beside Trystero's would remove the hold-ups; it is not worth the risk for this game.

### Testing with lag on one computer

Add `?lag=200&jitter=40` to the page address. Everything that page sends is held back 200 ms plus up to 40
ms, keeping order like a real connection. The invite link keeps the parameter, so the friend's page lags too:
200 ms each way. The console says `net: simulating 200 ms lag, 40 ms jitter`.

Measured this way (Trystero 0.27, real relays, guest page in an iframe so both pages stay visible):

| What                                       | Result                                              |
| ------------------------------------------ | --------------------------------------------------- |
| Guest presses a key → its own cat moves    | 19 ms (the host sees it 236 ms later)               |
| Guest's cat after letting go               | Same spot on both pages (0.000 m apart)             |
| Host's cat as seen by the guest, 58 frames | No stalled frames; speed 2.73–3.15 m/s, median 3.01 |
| Guest's round clock                        | 0.34 s behind the host's (lag + delay)              |

## Troubleshooting

A connection needs three things. The lobby's **Trouble connecting?** panel checks each one and says what to
do in plain words.

| Step                  | What can go wrong                             | How the game finds out                                                       | What the player is told                               |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1. Matchmaking        | No relay reachable (offline, VPN, ad blocker) | Counts open relay sockets every second (Trystero's `getRelaySockets`)        | Check the internet; try without a VPN or ad blocker   |
| 2. Finding the friend | Wrong code, or the host's tab is hidden       | Still waiting after `slow_join_seconds`                                      | Check the code; keep the room screen in front         |
| 3. Connecting         | The networks refuse a direct connection       | Trystero's `room.onError` with code `peer-connect-failed`                    | Found your friend, but the networks won't connect     |
| Network check         | WebRTC blocked by the browser or an extension | The check cannot start a WebRTC connection                                   | A privacy setting or extension is blocking it         |
| Network check         | STUN blocked (no public address)              | No `srflx` candidate comes back                                              | Only someone on the same Wi-Fi can connect            |
| Network check         | Strict (symmetric) NAT                        | More public ports than local sockets: the router changes the port per server | Works with most home networks, not another strict one |

How the network check works: it opens a WebRTC connection to nobody, using the same STUN servers as the
game, and reads the ICE candidates the browser gathers for `network_check_seconds`. Nothing is sent to the
other player. A `host` candidate means WebRTC works, a `srflx` one means STUN answered, and a `relay` one
means a TURN server answered. The strict-NAT test is a heuristic. A router that keeps one public port per
local socket is fine; one that hands each STUN server a different port is strict. A device with several
network interfaces can blur this, so the advice says "looks strict".

What the checks cannot see:

- **Two strict networks together.** Each side's check looks only at its own network. Both players should run
  it, and if both say "looks strict", only a TURN relay will connect them.
- **A firewall that lets STUN through but blocks the game's traffic.** This shows up as step 3: the
  friend is found but the connection fails.

**Copy report** puts a few lines like these on the clipboard for players to send when asking for help:

```text
role: guest
browser: Mozilla/5.0 (iPhone; …)
time: 2026-11-17T09:20:00.000Z
relays open: 4 of 5
waiting: 31 s
trouble: unreachable (peer-connect-failed: could not connect to peer …)
webrtc: yes
public address (stun): yes
turn relay: no
nat mapping: changes
advice: Found your friend, but your two networks wouldn't connect directly. …
```

It holds no IP addresses and no room code. The peer id in the trouble line is random for each page load.

### Testing on real networks

Two tabs on one computer always connect, so they prove the code and the relays work, but not the networks.
Before relying on online play, try these:

| Host                 | Guest                        | Expect                                                         |
| -------------------- | ---------------------------- | -------------------------------------------------------------- |
| Laptop on home Wi-Fi | Phone on the same Wi-Fi      | Connects                                                       |
| Laptop on home Wi-Fi | Phone on mobile data         | Usually connects; if not, the check shows which side is strict |
| Phone on mobile data | Another phone on mobile data | Often fails without TURN; the panel says why                   |

## Adding a TURN relay

Most home networks connect directly. If players on strict networks cannot connect, give Trystero a TURN
server. `trysteroJoiner` takes them:

```ts
trysteroJoiner({
  appId: "my-game",
  turn: [{ urls: "turn:turn.example.com:3478", username: "...", credential: "..." }],
});
```

When `stun` is also given, `trysteroJoiner` passes both lists together, so the network check (with
`iceServers(options)`) tests the TURN server too and reports `turn relay: yes`.

Several providers have free tiers. TURN credentials are secrets: list their names under `[secrets]` in
`config.toml` and keep the values in `secrets.env`, never in code. Note that anything shipped to a static page
is visible to its visitors, so use a provider that issues short-lived credentials, or accept that the free
tier's credentials are public.

## Upgrading Trystero

Trystero is pre-1.0 and its API can change between minor versions. Only `src/net/trysteroRoom.ts` and
`trysteroErrors.ts` touch it. To upgrade: check the release notes and `MIGRATION.md`, bump the pinned
version, fix those files, bump `PROTOCOL_VERSION` if the new version cannot talk to the old one, run
`pnpm check`, then test two real tabs (below). Prefer a release that has been out for a couple of weeks.

What 0.26 → 0.27 changed for us: `joinRoom` takes two arguments and errors come from `room.onError` as typed
codes instead of text; `onPeerJoin`, `onPeerLeave` and an action's `onMessage` are methods that return an
unsubscribe instead of properties; a send to a peer that has left rejects (we ignore `disconnected`);
`selfId` is gone (we dropped it from `NetRoom`, nothing used it). 0.27 cannot talk to 0.26, which the
protocol bump to 2 covers.

## Trying it locally

```bash
pnpm dev
```

Open the page in two windows (side by side, so neither is a throttled background tab). In one, choose **Play
with a friend → Be Arwen**; in the other, open the invite link or type the code. Both windows still go through
the public relays, so this needs an internet connection.

In the browser console, `catsGame.snapshot()` shows each side's state. The guest's clock runs a little
behind the host's: the playback delay plus any lag. Add `?lag=200` to feel a real connection (see
[Testing with lag on one computer](#testing-with-lag-on-one-computer)).
