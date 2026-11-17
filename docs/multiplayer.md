# Multiplayer with room codes, no server

Two people play together from a static web page. One opens a room and gets a short code (`K7QX`) and an
invite link; the other types the code or opens the link. There is no backend to run, deploy or pay for.

This document covers how it works, how it is built here, and how to lift it into another project.

## The short version

- **Library:** [Trystero](https://github.com/dmotz/trystero), pinned to `0.26.0`. MIT licence, free.
- **Matchmaking:** Trystero uses public Nostr relays to introduce the two browsers. We run nothing and need no
  account. The relays only see a hashed room id and connection details.
- **Game traffic:** browser to browser over WebRTC. It never touches the relays once connected.
- **Model:** host-authoritative. The host runs the game and sends snapshots; the guest sends its input and
  draws what it is sent.
- **Cost:** nothing. GitHub Pages hosts the page; Trystero and the relays are free.

## Trade-offs to know about

| Issue                                    | What happens                                                              | What to do                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Strict networks (some offices, carriers) | The direct connection fails; the guest stays on "Looking for the room…"   | Add a TURN relay (see [Adding a TURN relay](#adding-a-turn-relay)). Free tiers exist.       |
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
 20×/s  state: {whole GameState, events since last} ─────────────────────►  decode, draw, play sounds
                ◄───────────────────────────────────── input: {move, swat, stealth}  30×/s
```

The handshake is two messages so that a stray peer cannot take the seat: the host only accepts a peer that
answered its `hello` with the right protocol version, and it only accepts one. A third peer gets `full`.
Messages from anyone but the partner are ignored on both sides.

## How the code is split

```
src/net/          Game-agnostic. Nothing here imports the game. Copy this folder to reuse it.
  room.ts           NetRoom / NetChannel / JoinRoom: the transport seam.
  trysteroRoom.ts   The only file that imports Trystero.
  memoryRoom.ts     An in-page NetRoom for tests (MemoryHub, settle).
  session.ts        HostSession / GuestSession: handshake, seats, status, decoding.
  roomCode.ts       Codes, normalising typed codes, invite links.
  rate.ts           SendRate: "send N times a second, whatever the frame rate".

src/netplay/      This game's glue. Knows about cats; uses src/net.
  protocol.ts       PROTOCOL_VERSION, the Welcome message (which cat the guest plays).
  wire.ts           Decoders for GameState and CatInput: everything off the network is checked.
  hostMatch.ts      Runs the round locally and sends snapshots; the guest's input drives the other cat.
  guestMatch.ts     Shows snapshots and sends input; never runs the rules.
  lobby.ts          The "Play with a friend" screen.
  online.ts         Turns session status into rounds and messages.

src/play/localMatch.ts   The fixed-step loop. Solo and host both use it; the guest swaps in GuestMatch.
```

The game loop in `src/main.ts` talks to one interface, `Match`: `advance(dt, readMyInput)` returns the
events that happened, and `state` is what to draw. Solo is a `LocalMatch` with the computer as rival; the
host is a `HostMatch` wrapping a `LocalMatch` whose rival is the guest's input; the guest is a `GuestMatch`.
The renderer, HUD and sounds do not know which one they are looking at.

Settings live in `config.toml` under `[net]`: the app id, room code length, and the two send rates.

## Reusing it in another project

1. **Copy `src/net/`** and add the dependency, pinned:

   ```bash
   pnpm add -E trystero@0.26.0
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
     if (snapshots.due(dt)) host.sendState(currentState());
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
   guest.onSnapshot((state) => draw(state));
   guest.onStatus((status) => {
     if (status === "full") showMessage("That room is full");
     if (status === "mismatch") showMessage("Reload the page to update");
     if (status === "left") showMessage("Connection lost");
   });

   const inputs = new SendRate(30);
   function frame(dt: number) {
     if (inputs.due(dt)) guest.sendInput(readInput());
   }
   ```

6. **Test without a network** using `MemoryHub`: each `hub.join(id)` is a separate browser, messages go
   through JSON like the real wire, and `await settle()` delivers everything queued. See
   `src/net/session.test.ts` and `src/netplay/netplay.test.ts`.

### Design choices worth keeping

- **Send whole snapshots, not diffs.** A game state of a few kilobytes at 20 a second is nothing for a direct
  connection, and it removes a whole class of desync bugs. Switch to diffs only if snapshots get large.
- **Carry events with the snapshot.** The host collects every event since the last snapshot and sends them
  together, so the guest hears every sound even though it sees fewer frames.
- **Read input only when sending it.** A tap that lasts less than one send interval is held until the next
  send instead of being read and dropped in between.
- **Bump the protocol version** whenever the state, input or welcome shape changes. An old page and a new
  page then refuse each other with a clear message.
- **Keep the transport behind `NetRoom`.** Trystero can be replaced (another Trystero strategy, PeerJS, a
  WebSocket server) by writing one function that returns a `NetRoom`; nothing else changes.

## Adding a TURN relay

Most home networks connect directly. If players on strict networks cannot connect, give Trystero a TURN
server. `trysteroJoiner` takes them:

```ts
trysteroJoiner({
  appId: "my-game",
  turn: [{ urls: "turn:turn.example.com:3478", username: "...", credential: "..." }],
});
```

Several providers have free tiers. TURN credentials are secrets: list their names under `[secrets]` in
`config.toml` and keep the values in `secrets.env`, never in code. Note that anything shipped to a static page
is visible to its visitors, so use a provider that issues short-lived credentials, or accept that the free
tier's credentials are public.

## Upgrading Trystero

Trystero is pre-1.0 and its API can change between minor versions. Only `src/net/trysteroRoom.ts` touches it. To upgrade: check the release notes, bump the pinned
version, fix that one file, run `pnpm check`, then test two real tabs (below). Prefer a release that has been
out for a couple of weeks.

## Trying it locally

```bash
pnpm dev
```

Open the page in two windows (side by side, so neither is a throttled background tab). In one, choose **Play
with a friend → Be Arwen**; in the other, open the invite link or type the code. Both windows still go through
the public relays, so this needs an internet connection.

In the browser console, `catsGame.snapshot()` shows each side's state. The guest's clock should match the
host's to within a snapshot.
