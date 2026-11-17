import { SoundBoard } from "./audio";
import { loadSettings, type AppSettings } from "./config";
import { feedbackFor } from "./feedback";
import { MAIN_FLOOR } from "./house/mainFloor";
import { platformHeightAt, toWorld } from "./house/toWorld";
import type { HouseFloor } from "./house/types";
import { Keyboard } from "./input/keyboard";
import { AbilityButton, TapInput } from "./input/pointer";
import { pickGoal } from "./input/tapGoal";
import { loadCatViews, type CatView } from "./render/catView";
import { FollowCamera } from "./render/followCamera";
import { sightLine } from "./render/groundPicker";
import { buildHouse } from "./render/houseView";
import { KnockableViews } from "./render/knockableViews";
import { Markers } from "./render/markers";
import { createStage, type Stage } from "./render/stage";
import { iceServers, roomFromUrl, trysteroJoiner } from "./net";
import { Lobby } from "./netplay/lobby";
import { Online, type GameHooks, type OnlineRound } from "./netplay/online";
import { Troubleshooter, stunServers } from "./netplay/troubleshooter";
import { LocalMatch, computerRival, otherCat, type Match } from "./play/localMatch";
import { buildNavGrid, createGame, planWalk, walkInput, type NavGrid, type WalkGoal } from "./sim";
import {
  CAT_IDS,
  type CatId,
  type CatInput,
  type GameEvent,
  type GameState,
  type Vec2,
  type WorldDef,
} from "./sim/types";
import { abilityStatus } from "./ui/ability";
import { element } from "./ui/dom";
import { Hud } from "./ui/hud";
import { MischiefList } from "./ui/mischiefList";
import { Screens, type RoundMode } from "./ui/screens";

const MAX_FRAME = 0.1;
const MS_PER_SECOND = 1000;
const HALF = 0.5;

const HINTS: Record<CatId, string> = {
  brother: "Click or use WASD to move. Sit still on a ring to claim it. Space swats Arwen.",
  sister:
    "Click or use WASD to move. Sit still on a ring to claim it. Space: unseen for 3 seconds.",
};

interface Controls {
  readonly keyboard: Keyboard;
  readonly ability: AbilityButton;
}

/** Owns one running house: the rules state, the things drawn, and the loop that joins them. */
class Game implements GameHooks {
  /** The board shown behind the menus, before a round starts. */
  private readonly idle: GameState;
  private match: Match | null = null;
  /** Set for a round played with a friend; null when playing the computer. */
  private online: OnlineRound | null = null;
  /** The round ended and the result is showing; a guest leaves this when the host starts again. */
  private roundOver = false;
  private player: CatId | null = null;
  private lastTime = 0;
  private goal: WalkGoal | null = null;
  private openFriend: () => void = () => undefined;
  private readonly followCamera: FollowCamera;
  private readonly hud = new Hud();
  private readonly mischiefList = new MischiefList();
  private readonly sounds = new SoundBoard();
  private readonly screens: Screens;
  private readonly center: Vec2;

  constructor(
    private readonly settings: AppSettings,
    private readonly floor: HouseFloor,
    private readonly world: WorldDef,
    private readonly navs: Readonly<Record<CatId, NavGrid>>,
    private readonly stage: Stage,
    private readonly cats: Record<CatId, CatView>,
    private readonly markers: Markers,
    private readonly knockables: KnockableViews,
    private readonly controls: Controls,
  ) {
    this.idle = createGame(world, settings.sim);
    this.followCamera = new FollowCamera(stage.camera, settings.camera, world.bounds);
    this.center = {
      x: (world.bounds.minX + world.bounds.maxX) * HALF,
      z: (world.bounds.minZ + world.bounds.maxZ) * HALF,
    };
    this.screens = new Screens({
      onPick: (cat) => {
        this.beginSolo(cat);
      },
      onAgain: () => {
        this.playAgain();
      },
      onLeave: () => {
        this.leaveRoom();
      },
      onFriend: () => {
        this.openFriend();
      },
    });
  }

  /** How the menu's "Play with a friend" button opens the lobby. */
  setFriendEntry(open: () => void): void {
    this.openFriend = open;
  }

  /** Opens straight onto a screen other than the cat picker, such as the lobby from an invite link. */
  hideMenu(): void {
    this.screens.hideSelect();
  }

  // --- GameHooks: what an online session can ask of the game -------------------------------

  startRound(cat: CatId, match: Match, online: OnlineRound): void {
    this.screens.hideResult();
    this.begin(cat, match, online);
  }

  say(text: string): void {
    this.hud.say(text);
  }

  showNotice(title: string, detail: string): void {
    this.reset();
    this.screens.showNotice(title, detail);
  }

  idleState(): GameState {
    return this.idle;
  }

  backToMenu(): void {
    this.reset();
    this.screens.showSelect();
  }

  // -----------------------------------------------------------------------------------------

  private get state(): GameState {
    return this.match?.state ?? this.idle;
  }

  /** Read-only peek for play-testing from the browser console. */
  snapshot(): { readonly player: CatId | null; readonly state: GameState } {
    return { player: this.player, state: this.state };
  }

  private get mode(): RoundMode {
    if (this.online === null) {
      return "solo";
    }
    return this.online.canRestart ? "host" : "guest";
  }

  private beginSolo(cat: CatId): void {
    const sim = this.settings.sim;
    const rival = computerRival(this.world, sim, this.navs, otherCat(cat));
    this.begin(cat, new LocalMatch(this.world, sim, cat, rival), null);
  }

  private playAgain(): void {
    if (this.online?.canRestart === true) {
      this.online.restart();
      return;
    }
    this.backToMenu();
  }

  private leaveRoom(): void {
    const online = this.online;
    if (online === null) {
      this.backToMenu();
      return;
    }
    online.leave();
  }

  private begin(cat: CatId, match: Match, online: OnlineRound | null): void {
    this.match = match;
    this.online = online;
    this.player = cat;
    this.roundOver = false;
    this.showRoundUi(cat);
  }

  private showRoundUi(cat: CatId): void {
    this.hud.show(cat, this.world.napPoints.length, HINTS[cat]);
    this.mischiefList.show(cat, this.world.mischief);
    this.sounds.unlock();
    this.sounds.play(cat === "brother" ? "meow_brother" : "meow_sister");
    this.controls.ability.label(cat === "brother" ? "Swat" : "Stealth", cat);
    this.clearGoal();
  }

  private reset(): void {
    this.player = null;
    this.match = null;
    this.online = null;
    this.roundOver = false;
    this.hud.hide();
    this.mischiefList.hide();
    this.sounds.setPurring(false);
    this.controls.ability.hide();
    this.clearGoal();
  }

  /** The player tapped or clicked the stage: walk there. */
  tap(clientX: number, clientY: number): void {
    if (this.player === null || this.state.phase !== "playing") {
      return;
    }
    const line = sightLine(this.stage.camera, this.stage.renderer.domElement, clientX, clientY);
    const spot = pickGoal(line, this.floor.napPoints);
    if (spot === null) {
      return;
    }
    this.goal = planWalk(this.navs[this.player], spot) ?? null;
    const target = this.goal?.target ?? null;
    const height = target === null ? 0 : platformHeightAt(this.floor, target.x, target.z);
    this.markers.setGoal(target, height);
  }

  private clearGoal(): void {
    this.goal = null;
    this.markers.setGoal(null, 0);
  }

  /** Keys win over a tapped goal and cancel it; otherwise the cat follows its route until it arrives. */
  private playerMove(player: CatId): Vec2 {
    const keys = this.controls.keyboard.move();
    if (keys.x !== 0 || keys.z !== 0) {
      this.clearGoal();
      return keys;
    }
    if (this.goal === null) {
      return keys;
    }
    const move = walkInput(this.navs[player], this.goal, this.state.cats[player].pos);
    if (move.x === 0 && move.z === 0) {
      this.clearGoal();
    }
    return move;
  }

  private playerInput(player: CatId): CatInput {
    const ability = this.controls.keyboard.swat() || this.controls.ability.takePress();
    return { move: this.playerMove(player), swat: ability, stealth: ability };
  }

  private wireMute(): void {
    const button = element("mute", HTMLButtonElement);
    button.addEventListener("click", () => {
      const muted = !this.sounds.muted;
      this.sounds.unlock();
      this.sounds.setMuted(muted);
      button.textContent = muted ? "Sound off" : "Sound on";
      button.setAttribute("aria-pressed", String(muted));
    });
  }

  start(): void {
    this.wireMute();
    new ResizeObserver(() => {
      this.stage.resize();
    }).observe(this.stage.renderer.domElement);
    requestAnimationFrame((time) => {
      this.lastTime = time;
      this.frame(time);
    });
  }

  private frame(time: number): void {
    const dt = Math.min((time - this.lastTime) / MS_PER_SECOND, MAX_FRAME);
    this.lastTime = time;
    this.advance(dt);
    this.draw(dt);
    requestAnimationFrame((next) => {
      this.frame(next);
    });
  }

  private advance(dt: number): void {
    const player = this.player;
    if (player === null || this.match === null) {
      return;
    }
    this.reactAll(
      this.match.advance(dt, () => this.playerInput(player)),
      player,
    );
    this.resumeIfRestarted(player);
  }

  /** A guest learns of a new round only from the snapshots: the phase goes back to playing. */
  private resumeIfRestarted(player: CatId): void {
    if (!this.roundOver || this.state.phase !== "playing") {
      return;
    }
    this.roundOver = false;
    this.screens.hideResult();
    this.showRoundUi(player);
  }

  /** Play-testing aid: runs the rules ahead with a fixed input instead of waiting for real time. */
  fastForward(seconds: number, input: CatInput): void {
    const player = this.player;
    if (player === null || !(this.match instanceof LocalMatch)) {
      return;
    }
    this.reactAll(this.match.fastForward(seconds, input), player);
  }

  private reactAll(events: readonly GameEvent[], player: CatId): void {
    events.forEach((event) => {
      this.react(event, player);
    });
  }

  private react(event: GameEvent, player: CatId): void {
    const feedback = feedbackFor(event, player, this.world);
    if (feedback.toast !== null) {
      this.hud.say(feedback.toast);
    }
    feedback.sounds.forEach((sound) => {
      this.sounds.play(sound);
    });
    if (event.kind === "swatted" || event.kind === "swat_missed") {
      this.cats.brother.playSwat();
    }
    if (event.kind === "round_over") {
      this.roundOver = true;
      this.hud.hide();
      this.mischiefList.hide();
      this.screens.showResult(this.state, player, event.winner, this.mode);
    }
  }

  private draw(dt: number): void {
    for (const id of CAT_IDS) {
      const cat = this.state.cats[id];
      const ground = platformHeightAt(this.floor, cat.pos.x, cat.pos.z);
      this.cats[id].update(cat, ground, dt, this.player === "sister");
    }
    this.markers.update(this.state, dt);
    this.knockables.update(this.state, dt);
    this.hud.update(this.state);
    this.mischiefList.update(this.state);
    if (this.player !== null) {
      this.hud.showAbility(abilityStatus(this.state.cats[this.player]));
    }
    const me = this.player === null ? null : this.state.cats[this.player];
    this.sounds.setPurring(me !== null && me.napping && this.state.phase === "playing");
    const focus = this.player === null ? this.center : this.state.cats[this.player].pos;
    this.followCamera.update(focus, dt);
    this.stage.render();
  }
}

/** Hooks up "Play with a friend": the lobby, rooms over Trystero, and invite links. */
function wireOnline(
  game: Game,
  settings: AppSettings,
  online: ConstructorParameters<typeof Online>[1],
): void {
  const net = settings.net;
  const lobby: Lobby = new Lobby(
    {
      onHost: (cat) => {
        session.host(cat);
      },
      onJoin: (code) => {
        session.join(code);
      },
      onBack: () => {
        session.leave();
        lobby.hide();
        game.backToMenu();
      },
      onCheckNetwork: () => {
        help.runCheck();
      },
      report: () => help.report(),
    },
    net.roomCodeLength,
  );
  const transport = { appId: net.appId, stun: stunServers(net) };
  // The network check tests every server the game uses, including TURN if one is added.
  const help = new Troubleshooter(lobby, net, iceServers(transport));
  const joiner = trysteroJoiner(transport);
  const session = new Online(net, online, joiner, lobby, game, help);
  game.setFriendEntry(() => {
    lobby.open();
  });
  const invited = roomFromUrl(window.location.href, net.roomCodeLength);
  if (invited !== null) {
    // Drop the code from the address bar so a reload later does not reopen a room that has closed.
    window.history.replaceState(null, "", window.location.pathname);
    game.hideMenu();
    lobby.open(invited);
  }
}

async function boot(): Promise<Game> {
  const settings = loadSettings();
  const floor = MAIN_FLOOR;
  const world = toWorld(floor);
  const stage = createStage(element("stage", HTMLCanvasElement), world.bounds);
  const [house, cats] = await Promise.all([buildHouse(floor), loadCatViews(settings.sim.cats)]);
  const markers = new Markers(floor.napPoints, floor.treatSpawns);
  const knockables = new KnockableViews(floor.knockables);
  stage.scene.add(
    house,
    markers.object,
    knockables.object,
    cats.brother.object,
    cats.sister.object,
  );

  const navs = {
    brother: buildNavGrid(world, "brother", settings.sim),
    sister: buildNavGrid(world, "sister", settings.sim),
  };
  const game = new Game(settings, floor, world, navs, stage, cats, markers, knockables, {
    keyboard: new Keyboard(window),
    ability: new AbilityButton(element("swat-button", HTMLElement)),
  });
  wireOnline(game, settings, { world, sim: settings.sim, navs });
  new TapInput(stage.renderer.domElement, (x, y) => {
    game.tap(x, y);
  });
  game.start();
  return game;
}

declare global {
  interface Window {
    catsGame?: Game;
  }
}

void boot().then((game) => {
  window.catsGame = game;
});
