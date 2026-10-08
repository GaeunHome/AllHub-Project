import { createLocalPref } from "@/core/ui/local-pref";

export type SubtitleSize = "small" | "medium" | "large";

export const SUBTITLE_SIZES: readonly { id: SubtitleSize; label: string }[] = [
  { id: "small", label: "小" },
  { id: "medium", label: "中" },
  { id: "large", label: "大" },
];

const subtitleSize = createLocalPref<SubtitleSize>({
  key: "allhub:youtube:subtitle-size",
  defaultValue: "medium",
  parse: (stored) => SUBTITLE_SIZES.find((size) => size.id === stored)?.id,
});

export const readSubtitleSize = subtitleSize.read;

export const saveSubtitleSize = subtitleSize.save;

export function useSubtitleSize(): [SubtitleSize, (size: SubtitleSize) => void] {
  return [subtitleSize.useValue(), subtitleSize.save];
}
