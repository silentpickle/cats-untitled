import type { CatState } from "../sim/types";

export interface AbilityStatus {
  readonly text: string;
  readonly ready: boolean;
}

function wholeSeconds(seconds: number): string {
  return `${String(Math.ceil(seconds))}s`;
}

function swatStatus(cat: CatState): AbilityStatus {
  if (cat.swatCooldown > 0) {
    return { text: `Swat in ${wholeSeconds(cat.swatCooldown)}`, ready: false };
  }
  return { text: "Swat ready", ready: true };
}

function stealthStatus(cat: CatState): AbilityStatus {
  if (cat.stealthFor > 0) {
    return { text: `Unseen for ${wholeSeconds(cat.stealthFor)}`, ready: false };
  }
  if (cat.stealthCooldown > 0) {
    return { text: `Stealth in ${wholeSeconds(cat.stealthCooldown)}`, ready: false };
  }
  return { text: "Stealth ready", ready: true };
}

/** What the ability pill says for the player's cat. */
export function abilityStatus(cat: CatState): AbilityStatus {
  return cat.id === "brother" ? swatStatus(cat) : stealthStatus(cat);
}
