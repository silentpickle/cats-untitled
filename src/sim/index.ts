// Public surface of the game rules. Import from "src/sim", not from the files behind it.
export * from "./types";
export { createGame } from "./create";
export { step } from "./step";
export { aiInput } from "./ai";
export { buildNavGrid } from "./nav";
export type { NavGrid } from "./nav";
export type { WalkGrid } from "./navGrid";
export { NAV_CELL_SIZE, cellAt, cellCenter } from "./navGrid";
export type { DistanceField } from "./distanceField";
export { fieldDistance } from "./distanceField";
export { steerAlong } from "./steer";
export { IDLE_INPUT } from "./stateOps";
export { isHidden } from "./hide";
export { isNapping } from "./capture";
export { winnerOf } from "./round";
export { headingOf } from "./geometry";
