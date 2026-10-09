// 建立邀請的表單（瀏覽器）也用這些選項，所以獨立成不 import 任何東西的檔案

export const INVITE_DAY_OPTIONS = [1, 7, 30] as const;
export const INVITE_USE_OPTIONS = [1, 5, 10] as const;
/** 跟 core_invites_note_length 的檢查一致 */
export const INVITE_NOTE_MAX_LENGTH = 50;
