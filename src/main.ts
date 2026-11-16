import { loadSettings, type AppSettings } from "./config";
import { MAIN_FLOOR } from "./house/mainFloor";
import { platformHeightAt, toWorld } from "./house/toWorld";
import type { HouseFloor } from "./house/types";
import { Keyboard } from "./input/keyboard";
import { TouchControls } from "./input/touch";
import { loadCatViews, type CatView } from "./render/catView";
import { FollowCamera } from "./render/followCamera";
import { buildHouse } from "./render/houseView";
import { Markers } from "./render/markers";
import { createStage, type Stage } from "./render/stage";
import { aiInput, buildNavGrid, createGame, step, type NavGrid } from "./sim";
import {
  CAT_IDS,
  type CatId,
  type CatInput,
  type GameEvent,
  type GameState,
  type Inputs,
  type Vec2,
  type WorldDef,
} from "./sim/types";
import { element } from "./ui/dom";
import { Hud } from "./ui/hud";
import { Screens, catName } from "./ui/screens";

const STEPS_PER_SECOND = 60;
const SIM_STEP = 1 / STEPS_PER_SECOND;
const MAX_FRAME = 0.1;
const MS_PER_SECOND = 1000;
const HALF = 0.5;

const HINTS: Record<CatId, string> = {
  brother: "Sit still on a ring to claim it. Space swats your sister.",
  sister: "Sit still on a ring to claim it. Hide under tables; grab the gold treats.",
};

interface Controls {
  readonly keyboard: Keyboard;
  readonly touch: TouchControls;
}

function otherCat(cat: CatId): CatId {
  return cat === "brother" ? "sister" : "brother";
}

function playerInput(controls: Controls): CatInput {
  const keys = controls.keyboard.move();
  const stick = controls.touch.move();
  return {
    move: { x: keys.x + stick.x, z: keys.z + stick.z },
    swat: controls.keyboard.swat() || controls.touch.swat(),
  };
}

/** Owns one running house: the rules state, the things drawn, and the loop that joins them. */
class Game {
  private state: GameState;
  private player: CatId | null = null;
  private leftover = 0;
  private lastTime = 0;
  private readonly navs: Record<CatId, NavGrid>;
  private readonly followCamera: FollowCamera;
  private readonly hud = new Hud();
  private readonly screens: Screens;
  private readonly center: Vec2;

  constructor(
    private readonly settings: AppSettings,
    private readonly floor: HouseFloor,
    private readonly world: WorldDef,
    private readonly stage: Stage,
    private readonly cats: Record<CatId, CatView>,
    private readonly markers: Markers,
    private readonly controls: Controls,
  ) {
    this.state = createGame(world, settings.sim);
    this.navs = {
      brother: buildNavGrid(world, "brother", settings.sim),
      sister: buildNavGrid(world, "sister", settings.sim),
    };
    this.followCamera = new FollowCamera(stage.camera, settings.camera, world.bounds);
    this.center = {
      x: (world.bounds.minX + world.bounds.maxX) * HALF,
      z: (world.bounds.minZ + world.bounds.maxZ) * HALF,
    };
    this.screens = new Screens(
      (cat) => {
        this.begin(cat);
      },
      () => {
        this.reset();
      },
    );
  }

  /** Read-only peek for play-testing from the browser console. */
  snapshot(): { readonly player: CatId | null; readonly state: GameState } {
    return { player: this.player, state: this.state };
  }

  private begin(cat: CatId): void {
    this.state = createGame(this.world, this.settings.sim);
    this.player = cat;
    this.hud.show(cat, this.world.napPoints.length, HINTS[cat]);
    element("swat-button", HTMLElement).hidden = cat !== "brother";
  }

  private reset(): void {
    this.player = null;
    this.state = createGame(this.world, this.settings.sim);
    this.hud.hide();
  }

  start(): void {
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
    if (player === null) {
      return;
    }
    this.leftover += dt;
    while (this.leftover >= SIM_STEP) {
      this.leftover -= SIM_STEP;
      this.stepOnce(player, playerInput(this.controls));
    }
  }

  /** Play-testing aid: runs the rules ahead with a fixed input instead of waiting for real time. */
  fastForward(seconds: number, input: CatInput): void {
    const player = this.player;
    if (player === null) {
      return;
    }
    const steps = Math.round(seconds / SIM_STEP);
    for (let i = 0; i < steps; i += 1) {
      this.stepOnce(player, input);
    }
  }

  private stepOnce(player: CatId, mine: CatInput): void {
    const rival = otherCat(player);
    const ai = aiInput(this.state, rival, this.world, this.settings.sim, this.navs[rival]);
    const inputs: Inputs =
      player === "brother" ? { brother: mine, sister: ai } : { brother: ai, sister: mine };
    this.state = step(this.state, inputs, SIM_STEP, this.world, this.settings.sim);
    this.state.events.forEach((event) => {
      this.react(event, player);
    });
  }

  private react(event: GameEvent, player: CatId): void {
    const pointName = (id: string): string =>
      this.world.napPoints.find((point) => point.id === id)?.name ?? id;
    const handlers: { [K in GameEvent["kind"]]: (e: Extract<GameEvent, { kind: K }>) => void } = {
      captured: (e) => {
        this.hud.say(`${catName(e.by)} claimed the ${pointName(e.pointId)}`);
      },
      swatted: () => {
        this.cats.brother.playSwat();
        this.hud.say("Swat!");
      },
      swat_missed: () => {
        this.cats.brother.playSwat();
      },
      treat: (e) => {
        this.hud.say(`${catName(e.by)} found a treat`);
      },
      round_over: (e) => {
        this.hud.hide();
        this.screens.showResult(this.state, player, e.winner);
      },
    };
    (handlers[event.kind] as (e: GameEvent) => void)(event);
  }

  private draw(dt: number): void {
    for (const id of CAT_IDS) {
      const cat = this.state.cats[id];
      const ground = platformHeightAt(this.floor, cat.pos.x, cat.pos.z);
      this.cats[id].update(cat, ground, dt);
    }
    this.markers.update(this.state, dt);
    this.hud.update(this.state);
    const focus = this.player === null ? this.center : this.state.cats[this.player].pos;
    this.followCamera.update(focus, dt);
    this.stage.render();
  }
}

async function boot(): Promise<Game> {
  const settings = loadSettings();
  const floor = MAIN_FLOOR;
  const world = toWorld(floor);
  const stage = createStage(element("stage", HTMLCanvasElement), world.bounds);
  const [house, cats] = await Promise.all([buildHouse(floor), loadCatViews(settings.sim.cats)]);
  const markers = new Markers(floor.napPoints, floor.treatSpawns);
  stage.scene.add(house, markers.object, cats.brother.object, cats.sister.object);

  const touch = new TouchControls(
    element("stick", HTMLElement),
    element("knob", HTMLElement),
    element("swat-button", HTMLElement),
  );
  element("touch", HTMLElement).hidden = !window.matchMedia("(pointer: coarse)").matches;
  const game = new Game(settings, floor, world, stage, cats, markers, {
    keyboard: new Keyboard(window),
    touch,
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
