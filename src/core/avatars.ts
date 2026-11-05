// 範例頭像 圖是 public/images/avatars 的靜態檔 資料庫只存 id
// 圖源與授權見那個資料夾的 LICENSE.md

const AVATARS = {
  cat: "貓",
  dog: "狗",
  rabbit: "兔子",
  bear: "熊",
  fox: "狐狸",
  panda: "貓熊",
  koala: "無尾熊",
  tiger: "老虎",
  lion: "獅子",
  monkey: "猴子",
  hamster: "倉鼠",
  penguin: "企鵝",
  owl: "貓頭鷹",
  frog: "青蛙",
  chick: "小雞",
  unicorn: "獨角獸",
  whale: "鯨魚",
  turtle: "烏龜",
  robot: "機器人",
  alien: "外星人",
  ghost: "幽靈",
  planet: "行星",
  sakura: "櫻花",
} as const;

export type AvatarId = keyof typeof AVATARS;

export const AVATAR_IDS = Object.keys(AVATARS) as AvatarId[];

export const avatarName = (id: AvatarId): string => AVATARS[id];

export const avatarSrc = (id: AvatarId): string => `/images/avatars/${id}.webp`;

// 自己上傳的照片存在資料庫 core_users.avatar 記 img: 加圖片的 id 代碼只有英數與連字號
const UPLOADED = /^img:([0-9a-f-]{36})$/;

export const uploadedAvatar = (imageId: string) => `img:${imageId}`;

/** 認不得的當成沒有頭像 圖之後被移除時畫面退回文字頭像 不會破圖 */
export const avatarOf = (value: string | null | undefined): AvatarId | null => (value && Object.hasOwn(AVATARS, value) ? (value as AvatarId) : null);

/** 畫面要載入的圖 範例是靜態檔 上傳的經 API 讀 要登入才看得到 */
export function avatarUrl(value: string | null | undefined): string | null {
  const preset = avatarOf(value);
  if (preset) return avatarSrc(preset);
  const uploaded = value ? UPLOADED.exec(value)?.[1] : undefined;
  return uploaded ? `/api/avatars/${uploaded}` : null;
}
