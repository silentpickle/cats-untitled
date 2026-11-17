import { parse } from "smol-toml";
import configText from "../config.toml?raw";
import type { CatSettings, Settings } from "./sim/types";

export interface CameraSettings {
  readonly height: number;
  readonly distance: number;
  readonly followLerp: number;
}

export interface NetSettings {
  readonly appId: string;
  readonly roomCodeLength: number;
  readonly snapshotsPerSecond: number;
  readonly inputsPerSecond: number;
  readonly stunServers: readonly string[];
  readonly networkCheckSeconds: number;
  readonly slowJoinSeconds: number;
}

export interface AppSettings {
  readonly sim: Settings;
  readonly camera: CameraSettings;
  readonly net: NetSettings;
}

type Table = Record<string, unknown>;

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function table(parent: Table, key: string): Table {
  const value = parent[key];
  if (!isTable(value)) {
    throw new Error(`config.toml: [${key}] is missing`);
  }
  return value;
}

function num(parent: Table, key: string): number {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`config.toml: ${key} must be a number`);
  }
  return value;
}

function text(parent: Table, key: string): string {
  const value = parent[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`config.toml: ${key} must be a non-empty string`);
  }
  return value;
}

function textList(parent: Table, key: string): string[] {
  const value = parent[key];
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  const strings = items.filter((item): item is string => typeof item === "string" && item !== "");
  if (!Array.isArray(value) || strings.length !== items.length) {
    throw new Error(`config.toml: ${key} must be a list of non-empty strings`);
  }
  return strings;
}

function netSettings(root: Table): NetSettings {
  const net = table(root, "net");
  return {
    appId: text(net, "app_id"),
    roomCodeLength: num(net, "room_code_length"),
    snapshotsPerSecond: num(net, "snapshots_per_second"),
    inputsPerSecond: num(net, "inputs_per_second"),
    stunServers: textList(net, "stun_servers"),
    networkCheckSeconds: num(net, "network_check_seconds"),
    slowJoinSeconds: num(net, "slow_join_seconds"),
  };
}

function catSettings(cats: Table, key: string): CatSettings {
  const cat = table(cats, key);
  return {
    speed: num(cat, "speed"),
    scale: num(cat, "scale"),
    captureMultiplier: num(cat, "capture_multiplier"),
    radius: num(cat, "radius"),
  };
}

function simSettings(root: Table): Settings {
  const capture = table(root, "capture");
  const cats = table(root, "cats");
  const swat = table(root, "swat");
  const hide = table(root, "hide");
  const stealth = table(root, "stealth");
  const treats = table(root, "treats");
  const mischief = table(root, "mischief");
  return {
    round: { durationSeconds: num(table(root, "round"), "duration_seconds") },
    capture: {
      secondsToCapture: num(capture, "seconds_to_capture"),
      pointsPerSecond: num(capture, "points_per_second"),
      radius: num(capture, "radius"),
    },
    cats: { brother: catSettings(cats, "brother"), sister: catSettings(cats, "sister") },
    swat: {
      range: num(swat, "range"),
      stunSeconds: num(swat, "stun_seconds"),
      cooldownSeconds: num(swat, "cooldown_seconds"),
      missCooldownSeconds: num(swat, "miss_cooldown_seconds"),
      fleeSeconds: num(swat, "flee_seconds"),
    },
    stealth: {
      seconds: num(stealth, "seconds"),
      cooldownSeconds: num(stealth, "cooldown_seconds"),
    },
    hide: { pointsPerSecond: num(hide, "points_per_second"), teaseRange: num(hide, "tease_range") },
    treats: {
      points: num(treats, "points"),
      respawnSeconds: num(treats, "respawn_seconds"),
      pickupRadius: num(treats, "pickup_radius"),
    },
    mischief: {
      points: num(mischief, "points"),
      knockRadius: num(mischief, "knock_radius"),
      knockPoints: num(mischief, "knock_points"),
      resetSeconds: num(mischief, "reset_seconds"),
    },
  };
}

export function parseSettings(text: string): AppSettings {
  const root: unknown = parse(text);
  if (!isTable(root)) {
    throw new Error("config.toml: not a table");
  }
  const camera = table(root, "camera");
  return {
    sim: simSettings(root),
    camera: {
      height: num(camera, "height"),
      distance: num(camera, "distance"),
      followLerp: num(camera, "follow_lerp"),
    },
    net: netSettings(root),
  };
}

export function loadSettings(): AppSettings {
  return parseSettings(configText);
}
