import { describe, expect, it } from "vitest";
import { troubleFor } from "./trysteroErrors";

describe("troubleFor", () => {
  it("calls a failed direct connection unreachable", () => {
    expect(troubleFor({ code: "peer-connect-failed", message: "no route" })).toEqual({
      kind: "unreachable",
      detail: "peer-connect-failed: no route",
    });
  });

  it.each(["decrypt-failed", "handshake-failed", "room-full", "banned"] as const)(
    "calls %s a refusal",
    (code) => {
      expect(troubleFor({ code, message: "" })?.kind).toBe("refused");
    },
  );

  it.each(["relay-failed", "identity-failed", "plugin-failed", "peer-error"] as const)(
    "does not show %s to the player",
    (code) => {
      expect(troubleFor({ code, message: "" })).toBeNull();
    },
  );
});
