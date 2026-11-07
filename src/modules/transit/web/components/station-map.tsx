"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { DRAG_PX } from "@/core/ui/drag-scroll";
import { Icon } from "@/core/ui/icon";
import { LABEL_EM, LABEL_GAP, type MapPoint, type MapStation, type MetroMap } from "../../lib/metro-map";
import { isSameStation } from "../../lib/station-search";
import type { Station } from "../../lib/timetable";

type MapProps = { map: MetroMap; value: string; except: Station | null; onPick: (stationId: string) => void };

/** 縮放 1 時一格的像素 站名約 12px */
const UNIT_PX = 30;
/** 一打開至少放大到站名讀得清楚 手機放不下整張圖 改成對準選好的站 */
const READABLE_ZOOM = 0.9;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;

/** 縮放後讓圖上的這一點留在視窗的這個位置 */
type Anchor = MapPoint & { viewX: number; viewY: number };
type View = { zoom: number; anchor: Anchor | null };
type Press = { pointerId: number; x: number; y: number; left: number; top: number; dragging: boolean };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function stationLabel({ name, lines }: MapStation, other: boolean): string {
  const onLines = lines.length > 0 ? `（${lines.join("、")}）` : "";
  return `${name}${onLines}${other ? "，另一端已經選了這站" : ""}`;
}

/** 每一站是真的按鈕 照座標的比例疊在線上 站名也在按鈕裡 點字也算 */
export function MapStations({ map, value, except, onPick }: MapProps) {
  return (
    <>
      {map.stations.map((station) => {
        const other = except !== null && isSameStation(station, except);
        const style = { left: `${(station.x / map.width) * 100}%`, top: `${(station.y / map.height) * 100}%`, "--trn-line": station.color } as CSSProperties;
        return (
          <button
            key={station.id}
            type="button"
            onClick={() => onPick(station.id)}
            disabled={other}
            aria-label={stationLabel(station, other)}
            aria-current={station.ids.includes(value) ? "true" : undefined}
            data-side={station.side}
            data-transfer={station.transfer ? "" : undefined}
            data-other={other ? "" : undefined}
            className="trn-map-station"
            style={style}
          >
            <span aria-hidden="true" className="trn-map-dot" />
            <span aria-hidden="true" className="trn-map-label">
              {station.name}
            </span>
          </button>
        );
      })}
    </>
  );
}

const pointsOf = (points: MapPoint[]) => points.map(({ x, y }) => `${x},${y}`).join(" ");

function MapLines({ map }: { map: MetroMap }) {
  return (
    <svg className="trn-map-lines" viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true" focusable="false">
      {map.lines.map((line) => (
        <polyline key={line.key} points={pointsOf(line.points)} fill="none" stroke={line.color} strokeWidth={0.22} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {map.links.map(([from, to]) => (
        <g key={`${from.x},${from.y}`}>
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="trn-map-link" />
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="trn-map-link-gap" />
        </g>
      ))}
    </svg>
  );
}

/** 先對準選好的站 再來是另一端的站 都沒有就對準台北車站 */
function focusOf({ stations, center }: MetroMap, value: string, except: Station | null): MapPoint {
  return stations.find((station) => station.ids.includes(value)) ?? (except && stations.find((station) => isSameStation(station, except))) ?? center;
}

type ZoomControls = { zoomTo: (next: number, viewX: number, viewY: number, point?: MapPoint | null) => void; pointAt: (viewX: number, viewY: number) => MapPoint | null; zoom: number };

/** 觸控板的捏合也是 ctrl 加滾輪 要能擋掉預設 所以不用 React 的 onWheel */
function useZoomGestures(viewportRef: RefObject<HTMLDivElement | null>, { zoomTo, pointAt, zoom }: ZoomControls) {
  // 監聽只掛一次 要讀到最新的縮放
  const zoomAt = useEffectEvent(zoomTo);
  const pointUnder = useEffectEvent(pointAt);
  const currentZoom = useEffectEvent(() => zoom);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let pinch: (MapPoint & { distance: number; zoom: number }) | null = null;
    const twoFingers = (touches: TouchList) => {
      const rect = viewport.getBoundingClientRect();
      const [a, b] = [touches[0], touches[1]];
      return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), viewX: (a.clientX + b.clientX) / 2 - rect.left, viewY: (a.clientY + b.clientY) / 2 - rect.top };
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAt(currentZoom() * Math.exp(-clamp(event.deltaY, -50, 50) / 100), event.clientX - rect.left, event.clientY - rect.top);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinch = null;
        return;
      }
      const { distance, viewX, viewY } = twoFingers(event.touches);
      const point = pointUnder(viewX, viewY);
      pinch = point && { ...point, distance, zoom: currentZoom() };
    };
    // 兩指之間的那一點跟著手指走 縮放與移動一起
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2 || pinch.distance === 0) return;
      event.preventDefault();
      const { distance, viewX, viewY } = twoFingers(event.touches);
      zoomAt((pinch.zoom * distance) / pinch.distance, viewX, viewY, { x: pinch.x, y: pinch.y });
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd);
    viewport.addEventListener("touchcancel", onTouchEnd);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [viewportRef]);
}

/** 手指本來就能捲 只有滑鼠要自己拖 */
function useMouseDragScroll() {
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const { scrollLeft, scrollTop } = event.currentTarget;
    press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: scrollLeft, top: scrollTop, dragging: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current?.pointerId !== event.pointerId) return;
    const [dx, dy] = [event.clientX - current.x, event.clientY - current.y];
    if (!current.dragging) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "";
    }
    event.currentTarget.scrollLeft = current.left - dx;
    event.currentTarget.scrollTop = current.top - dy;
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (press.current?.pointerId !== event.pointerId) return;
    // 拖完放開時的 click 不算選站
    dragged.current = press.current.dragging && event.type === "pointerup";
    press.current = null;
    delete event.currentTarget.dataset.dragging;
  };
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragged.current) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release, onClickCapture };
}

/**
 * 整張路網的示意圖 按鈕 ctrl 或 ⌘ 加滾輪 兩指都能縮放 捲動或用滑鼠拖曳移動
 * 一打開照寬度放滿 太小讀不到字時改成對準選好的站
 */
export function StationMap(props: MapProps) {
  const { map, value, except } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [view, setView] = useState<View>({ zoom: 1, anchor: null });
  const [fitAll, setFitAll] = useState(0);
  const unit = UNIT_PX * view.zoom;

  // 縮放後的大小要等畫好才知道 在繪製前捲到記下的位置 畫面不會跳一下
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || !view.anchor) return;
    viewport.scrollLeft = view.anchor.x * UNIT_PX * view.zoom + canvas.offsetLeft - view.anchor.viewX;
    viewport.scrollTop = view.anchor.y * UNIT_PX * view.zoom + canvas.offsetTop - view.anchor.viewY;
  }, [view]);

  /** 視窗裡 viewX viewY 那一點下面是圖上的哪裡 */
  const pointAt = (viewX: number, viewY: number): MapPoint | null => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return null;
    return { x: (viewport.scrollLeft + viewX - canvas.offsetLeft) / unit, y: (viewport.scrollTop + viewY - canvas.offsetTop) / unit };
  };
  /** 縮放到 next 倍 視窗裡 viewX viewY 那一點下面的站不動 */
  const zoomTo = (next: number, viewX: number, viewY: number, point: MapPoint | null = pointAt(viewX, viewY)) => {
    if (point) setView({ zoom: clamp(next, fitAll, MAX_ZOOM), anchor: { ...point, viewX, viewY } });
  };
  // 視窗打開後才量得到大小 第一次量到時決定放大多少
  const measured = useEffectEvent((width: number, height: number) => {
    const fitWidth = width / (map.width * UNIT_PX);
    const all = Math.min(fitWidth, height / (map.height * UNIT_PX));
    setFitAll(all);
    if (started.current) {
      if (view.zoom < all) setView({ zoom: all, anchor: null });
      return;
    }
    started.current = true;
    const { x, y } = focusOf(map, value, except);
    setView({ zoom: clamp(Math.max(fitWidth, READABLE_ZOOM), all, MAX_ZOOM), anchor: { x, y, viewX: width / 2, viewY: height / 2 } });
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth > 0 && viewport.clientHeight > 0) measured(viewport.clientWidth, viewport.clientHeight);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useZoomGestures(viewportRef, { zoomTo, pointAt, zoom: view.zoom });

  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    if (viewport) zoomTo(view.zoom * factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
  };
  const showAll = () => {
    const viewport = viewportRef.current;
    if (viewport) setView({ zoom: fitAll, anchor: { x: map.width / 2, y: map.height / 2, viewX: viewport.clientWidth / 2, viewY: viewport.clientHeight / 2 } });
  };

  const dragScroll = useMouseDragScroll();

  const canvasStyle = { width: map.width * unit, height: map.height * unit, "--trn-map-u": `${unit}px`, "--trn-map-em": LABEL_EM, "--trn-map-gap": LABEL_GAP } as CSSProperties;
  const atMost = view.zoom >= MAX_ZOOM;
  const atLeast = view.zoom <= fitAll;

  return (
    <div role="group" aria-label="捷運路線圖" className="trn-map">
      <div ref={viewportRef} className="trn-map-viewport" {...dragScroll}>
        <div ref={canvasRef} className="trn-map-canvas" style={canvasStyle}>
          <MapLines map={map} />
          <MapStations {...props} />
        </div>
      </div>
      {/* 到底了不用 disabled 焦點才不會掉到視窗外 */}
      <div className="trn-map-tools">
        <button type="button" onClick={() => !atMost && zoomBy(ZOOM_STEP)} aria-disabled={atMost} aria-label="放大" title="放大" className="btn-secondary btn-sm btn-icon">
          <Icon name="plus" className="size-4" />
        </button>
        <button type="button" onClick={() => !atLeast && zoomBy(1 / ZOOM_STEP)} aria-disabled={atLeast} aria-label="縮小" title="縮小" className="btn-secondary btn-sm btn-icon">
          <Icon name="minus" className="size-4" />
        </button>
        <button type="button" onClick={showAll} aria-label="看全圖" title="看全圖" className="btn-secondary btn-sm btn-icon">
          <Icon name="maximize" className="size-4" />
        </button>
      </div>
    </div>
  );
}
