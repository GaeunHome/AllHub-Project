import { createHash, randomInt } from "node:crypto";

/** genshin.py 國際服（overseas）用的 salt；HoYoLAB 改版時可能失效 */
export const DS_SALT = "6s25p5ox5y14umn1p61aqyyvbvvl3lrt";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomToken(length = 6): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** 戰績類介面要求的 DS 標頭：`時間,亂數,md5(salt=…&t=…&r=…)` */
export function generateDs(nowMs: number = Date.now(), random: () => string = randomToken): string {
  const t = Math.floor(nowMs / 1000);
  const r = random();
  const hash = createHash("md5").update(`salt=${DS_SALT}&t=${t}&r=${r}`).digest("hex");
  return `${t},${r},${hash}`;
}
