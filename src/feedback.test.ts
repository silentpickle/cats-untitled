import { describe, expect, it } from "vitest";
import { feedbackFor } from "./feedback";
import { MAIN_FLOOR } from "./house/mainFloor";
import { toWorld } from "./house/toWorld";

const world = toWorld(MAIN_FLOOR);

describe("feedback for game events", () => {
  it("own_capture_names_the_spot_and_meows", () => {
    const feedback = feedbackFor(
      { kind: "captured", pointId: "couch", by: "sister" },
      "sister",
      world,
    );
    expect(feedback.toast).toBe("Arwen claimed the Couch");
    expect(feedback.sounds).toEqual(["capture", "meow_sister"]);
  });

  it("rival_capture_plays_the_losing_sound", () => {
    const feedback = feedbackFor(
      { kind: "captured", pointId: "couch", by: "brother" },
      "sister",
      world,
    );
    expect(feedback.toast).toBe("Aragorn claimed the Couch");
    expect(feedback.sounds).toEqual(["capture_lost"]);
  });

  it("rival_treat_is_shown_but_silent", () => {
    const feedback = feedbackFor(
      { kind: "treat", treatId: "treat_tv", by: "brother" },
      "sister",
      world,
    );
    expect(feedback).toEqual({ toast: "Aragorn found a treat", sounds: [] });
  });

  it("knock_names_the_thing", () => {
    const feedback = feedbackFor(
      { kind: "knocked", knockableId: "cup", by: "brother" },
      "sister",
      world,
    );
    expect(feedback).toEqual({ toast: "Aragorn knocked over the coffee cup", sounds: ["knock"] });
  });

  it("own_mischief_shows_its_label_and_rival_mischief_is_quiet", () => {
    const mine = feedbackFor(
      { kind: "mischief", mischiefId: "knock_cup", by: "brother" },
      "brother",
      world,
    );
    expect(mine).toEqual({
      toast: "Mischief done: Knock the cup off the counter",
      sounds: ["mischief"],
    });
    const theirs = feedbackFor(
      { kind: "mischief", mischiefId: "knock_cup", by: "brother" },
      "sister",
      world,
    );
    expect(theirs).toEqual({ toast: null, sounds: [] });
  });

  it("round_end_sound_follows_the_winner", () => {
    const sounds = (winner: "brother" | "sister" | "tie"): readonly string[] =>
      feedbackFor({ kind: "round_over", winner }, "sister", world).sounds;
    expect(sounds("sister")).toEqual(["round_win"]);
    expect(sounds("tie")).toEqual(["round_win"]);
    expect(sounds("brother")).toEqual(["round_lose"]);
  });
});
