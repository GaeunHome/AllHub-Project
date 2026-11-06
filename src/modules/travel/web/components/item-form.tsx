"use client";

import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { InfoTip } from "@/core/ui/info-tip";
import { DEFAULT_STAY_MINUTES, ITEM_KINDS, type ItemKind } from "../../lib/rules";
import type { TripItem } from "../../service/trips";
import { addItemAction, updateItemAction } from "../actions";

export const KIND_LABELS: Record<ItemKind, string> = { place: "景點", food: "吃飯", transport: "交通", stay: "住宿", other: "其他" };

type ItemFormProps = {
  tripId: number;
  /** 新增到哪一天 null 是想去的點 修改時不用 */
  day?: string | null;
  item?: TripItem;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 只貼地圖連結就能新增 名稱伺服器從連結讀 分鐘與名稱不設 maxLength 以伺服器的驗證為準 */
export function ItemForm({ tripId, day = null, item, onDone, onCancel }: ItemFormProps) {
  const { state, pending, formProps } = useDialogForm(item ? updateItemAction : addItemAction, onDone);

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="tripId" value={tripId} />
      {item ? (
        <>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="version" value={item.version} />
        </>
      ) : (
        <input type="hidden" name="day" value={day ?? ""} />
      )}
      <label className="field">
        <span className="field-label">Google Maps 連結（選填）</span>
        <input name="mapsUrl" type="url" defaultValue={item?.mapsUrl ?? ""} placeholder="https://maps.app.goo.gl/…" autoComplete="off" data-autofocus className="input" />
      </label>
      <label className="field">
        <span className="field-label">名稱（貼了連結可以不填）</span>
        <input name="title" defaultValue={item?.title} placeholder="例如：清水寺" autoComplete="off" className="input" />
      </label>
      <label className="field">
        <span className="field-label">種類</span>
        <select name="kind" defaultValue={item?.kind ?? "place"} className="input">
          {ITEM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">
          <span className="field-label">停留幾分鐘</span>
          <input name="stayMinutes" type="number" min={0} max={1440} step={5} defaultValue={item?.stayMinutes ?? DEFAULT_STAY_MINUTES} className="input" />
        </label>
        <label className="field">
          <span className="field-label">交通幾分鐘</span>
          <input name="travelMinutes" type="number" min={0} max={1440} step={5} defaultValue={item?.travelMinutes ?? 0} className="input" />
        </label>
      </div>
      <div className="field">
        <span className="flex items-center gap-1">
          <label htmlFor="trv-fixed-time" className="field-label">
            固定時間（選填）
          </label>
          <InfoTip label="固定時間的說明">訂位或搭車這類不能改的時間</InfoTip>
        </span>
        <input id="trv-fixed-time" name="fixedTime" type="time" defaultValue={item?.fixedTime ?? ""} className="input" />
      </div>
      <label className="field">
        <span className="field-label">備註（選填）</span>
        <textarea name="note" rows={3} defaultValue={item?.note ?? ""} className="input" />
      </label>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
