/**
 * Short codes people read aloud or type on a phone. The alphabet leaves out look-alikes (0/O, 1/I) so a
 * code survives being read off a screen. Codes only have to be unique among rooms open right now, so a
 * few characters are plenty.
 */

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The URL query parameter a share link carries the code in: `?room=K7QX`. */
export const ROOM_QUERY_PARAM = "room";

const BYTE_VALUES = 256;

/** Fills a byte array with random values; `crypto.getRandomValues` in the browser. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const cryptoBytes: RandomBytes = (bytes) => crypto.getRandomValues(bytes);

/**
 * Bytes at or above this are thrown away so every character is equally likely, whatever the alphabet's
 * length (rejection sampling instead of a biased `byte % length`).
 */
function usableByteLimit(alphabetLength: number): number {
  return BYTE_VALUES - (BYTE_VALUES % alphabetLength);
}

/** Up to `count` unbiased characters; fewer when some random bytes had to be thrown away. */
function randomChars(count: number, random: RandomBytes, alphabet: string): string {
  const limit = usableByteLimit(alphabet.length);
  return [...random(new Uint8Array(count))]
    .filter((byte) => byte < limit)
    .map((byte) => alphabet.charAt(byte % alphabet.length))
    .join("");
}

/** A fresh random code of `length` characters, from `ROOM_CODE_ALPHABET` unless told otherwise. */
export function makeRoomCode(
  length: number,
  random: RandomBytes = cryptoBytes,
  alphabet: string = ROOM_CODE_ALPHABET,
): string {
  let code = "";
  while (code.length < length) {
    code += randomChars(length - code.length, random, alphabet);
  }
  return code;
}

/**
 * Turns what someone typed into a code, or null if it cannot be one: case and spaces or dashes are
 * forgiven, letters outside the alphabet and the wrong length are not.
 */
export function normalizeRoomCode(
  text: string,
  length: number,
  alphabet: string = ROOM_CODE_ALPHABET,
): string | null {
  const code = text.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== length) {
    return null;
  }
  const valid = Array.from(code).every((char) => alphabet.includes(char));
  return valid ? code : null;
}

/** A link that opens the page straight into the join flow for `code`. */
export function roomLink(pageUrl: string, code: string): string {
  const url = new URL(pageUrl);
  url.hash = "";
  url.searchParams.set(ROOM_QUERY_PARAM, code);
  return url.toString();
}

/** The code a share link carries, if it is a valid one. */
export function roomFromUrl(pageUrl: string, length: number): string | null {
  const raw = new URL(pageUrl).searchParams.get(ROOM_QUERY_PARAM);
  return raw === null ? null : normalizeRoomCode(raw, length);
}
