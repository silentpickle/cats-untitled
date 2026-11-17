import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  makeRoomCode,
  normalizeRoomCode,
  roomFromUrl,
  roomLink,
  type RandomBytes,
} from "./roomCode";

const LENGTH = 4;
const PAGE = "https://example.test/cats/index.html";
const SAMPLES = 200;
const BYTE_REJECTED = 255;

/** Replays fixed bytes, so a test can choose exactly which characters come out. */
function scripted(bytes: readonly number[]): RandomBytes {
  let next = 0;
  return (target) => {
    for (let i = 0; i < target.length; i += 1) {
      target[i] = bytes[next % bytes.length] ?? 0;
      next += 1;
    }
    return target;
  };
}

describe("makeRoomCode", () => {
  it("makes codes of the asked length from the alphabet only", () => {
    for (let i = 0; i < SAMPLES; i += 1) {
      const code = makeRoomCode(LENGTH);
      expect(code).toHaveLength(LENGTH);
      expect(Array.from(code).every((char) => ROOM_CODE_ALPHABET.includes(char))).toBe(true);
    }
  });

  it("maps bytes onto the alphabet in order", () => {
    const third = 2;
    const fourth = 3;
    const code = makeRoomCode(LENGTH, scripted([0, 1, third, fourth]));
    expect(code).toBe(ROOM_CODE_ALPHABET.slice(0, LENGTH));
  });

  it("throws away bytes that would bias the pick and draws again", () => {
    // 256 % 3 = 1, so byte 255 would favour "a"; it must be skipped, not mapped.
    const code = makeRoomCode(LENGTH, scripted([BYTE_REJECTED, 1]), "abc");
    expect(code).toBe("b".repeat(LENGTH));
  });

  it("keeps the highest unbiased byte", () => {
    const highestKept = 254;
    const code = makeRoomCode(LENGTH, scripted([highestKept]), "abc");
    expect(code).toBe("c".repeat(LENGTH));
  });
});

describe("normalizeRoomCode", () => {
  it("forgives case, spaces and dashes", () => {
    expect(normalizeRoomCode(" k7-qx ", LENGTH)).toBe("K7QX");
  });

  it("rejects the wrong length", () => {
    expect(normalizeRoomCode("K7Q", LENGTH)).toBeNull();
    expect(normalizeRoomCode("K7QXY", LENGTH)).toBeNull();
  });

  it("rejects look-alike characters left out of the alphabet", () => {
    expect(normalizeRoomCode("K0QX", LENGTH)).toBeNull();
    expect(normalizeRoomCode("KIQX", LENGTH)).toBeNull();
  });
});

describe("share links", () => {
  it("round-trips a code through a link", () => {
    const link = roomLink(`${PAGE}#old`, "K7QX");
    expect(link).toBe(`${PAGE}?room=K7QX`);
    expect(roomFromUrl(link, LENGTH)).toBe("K7QX");
  });

  it("finds no code in a plain page link or a bad one", () => {
    expect(roomFromUrl(PAGE, LENGTH)).toBeNull();
    expect(roomFromUrl(`${PAGE}?room=nope!`, LENGTH)).toBeNull();
  });
});
