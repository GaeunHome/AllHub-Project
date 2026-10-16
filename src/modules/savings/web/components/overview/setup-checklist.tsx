"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { Icon } from "@/core/ui/icon";
import { parseSkippedSteps, remainingSteps, serializeSkippedSteps, type SetupStep } from "../../../lib/setup";
import type { SetupView } from "../../overview-view";
import { addAccountPath, addRecurringPath } from "../../paths";
import { SetupButton } from "../forms/setup-button";
import { Illustration } from "../illustration";
import { setupCollapsedPref, setupSkippedPref } from "./overview-prefs";

const STEPS: Record<SetupStep, { title: string; hint: string; href: string; action: string }> = {
  deposit: { title: "新增銀行帳戶", hint: "填目前的餘額，從今天開始記。", href: addAccountPath("deposit"), action: "新增銀行帳戶" },
  credit: { title: "新增信用卡", hint: "設定結帳日與扣款帳戶，結帳後會提醒你填帳單。", href: addAccountPath("credit"), action: "新增信用卡" },
  investment: { title: "新增證券帳戶與持股", hint: "照券商 App 的庫存填股數與成本，市值照收盤價算。", href: addAccountPath("investment"), action: "新增證券帳戶" },
  salary: { title: "設定薪水", hint: "發薪日與金額，入帳時一次分到各帳戶。", href: addRecurringPath("salary"), action: "設定薪水" },
  recurring: { title: "設定每月固定支出", hint: "房租、訂閱、電費…到期時會提醒你確認。", href: addRecurringPath("other"), action: "新增固定支出" },
};

/**
 * 還有沒做的步驟時才出現 required 是還沒有帳戶 這張就是整個總覽 不能收起或略過
 * 收起與略過的樣子由 html 上的屬性決定 見 overview-prefs.ts
 */
export function SetupChecklist({ view }: { view: SetupView }) {
  const headingId = useId();
  const bodyId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const skipped = parseSkippedSteps(setupSkippedPref.useValue());
  const required = view.required;
  const done = view.status.filter((item) => item.done).length;
  // 一頁只有一個主要按鈕 還沒有分類時是開始使用 之後是第一個還要做的步驟
  const [next] = view.needsCategories ? [] : remainingSteps(view.status, required ? [] : skipped);

  const focus = (selector: string) => sectionRef.current?.querySelector<HTMLElement>(selector)?.focus();
  const collapse = (collapsed: boolean) => {
    setupCollapsedPref.save(collapsed);
    focus(collapsed ? "[data-setup-expand]" : "[data-setup-collapse]");
  };
  const skip = (step: SetupStep, value: boolean) => {
    const current = parseSkippedSteps(setupSkippedPref.read());
    setupSkippedPref.save(serializeSkippedSteps(value ? [...current, step] : current.filter((item) => item !== step)));
    focus(`[data-step="${step}"] ${value ? "[data-step-restore]" : "[data-step-link]"}`);
  };

  return (
    <section ref={sectionRef} aria-labelledby={headingId} data-required={required || undefined} className="fin-setup card stack @container min-w-0">
      <header className="flex items-center gap-4">
        {/* 收起時連插圖一起藏 顯示與否寫在外面這一層 才不會被裡面的排版蓋過 */}
        <div className="fin-setup-open shrink-0">
          <Illustration name={required ? "no-accounts" : "setup"} className={required ? "w-28 @md:w-40 @2xl:w-56" : "hidden w-24 @md:block"} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={headingId} className="text-lg font-semibold text-ink">
            開始設定
          </h2>
          <p className="text-ink-soft">
            <span className="font-medium text-ink">
              已完成 {done}/{view.status.length}
            </span>
            <span className="fin-setup-open">{required ? " · 先新增一個帳戶，總資產與每個月要做的事就會出現在這裡。" : " · 照著做一遍，之後每個月照「這個月要做的事」做就好。"}</span>
          </p>
        </div>
        {!required && (
          <>
            <button type="button" data-setup-collapse aria-expanded="true" aria-controls={bodyId} onClick={() => collapse(true)} className="fin-setup-open btn-ghost btn-sm shrink-0">
              收起
            </button>
            <button type="button" data-setup-expand aria-expanded="false" aria-controls={bodyId} onClick={() => collapse(false)} className="fin-setup-closed btn-secondary btn-sm shrink-0">
              展開
            </button>
          </>
        )}
      </header>

      <div id={bodyId} className="fin-setup-open stack">
        {view.needsCategories && (
          <div className="panel flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="min-w-48 flex-1 text-ink">先建立常用的分類，例如餐飲、交通、薪水（之後都能改）。</p>
            <SetupButton />
          </div>
        )}
        <ol className="card-list">
          {view.status.map((item, index) => {
            const step = STEPS[item.step];
            return (
              <li key={item.step} data-step={item.step} className="fin-step card-row grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 @xl:grid-cols-[auto_minmax(0,1fr)_auto]">
                {/* 窄的時候按鈕排到說明下面 跟文字對齊 */}
                <span className="row-span-2 self-start @xl:row-span-1 @xl:self-center">
                  <StepMark done={item.done} number={index + 1} skippable={!required} />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className={`fin-step-title font-semibold ${item.done ? "text-ink-soft" : "text-ink"}`}>
                    {step.title}
                    {item.done && <span className="sr-only">（完成）</span>}
                  </p>
                  <p className="text-sm text-ink-soft">{step.hint}</p>
                </div>
                <div className="col-start-2 @xl:col-start-3">
                  {item.done ? (
                    <span className="text-sm font-medium text-ink-soft">完成</span>
                  ) : (
                    <>
                      <div className="fin-step-todo button-row">
                        <Link href={step.href} data-step-link className={`${item.step === next ? "btn-primary" : "btn-secondary"} btn-sm`}>
                          {step.action}
                        </Link>
                        {!required && (
                          <button type="button" aria-label={`略過：${step.title}`} onClick={() => skip(item.step, true)} className="btn-ghost btn-sm">
                            略過
                          </button>
                        )}
                      </div>
                      {!required && (
                        <div className="fin-step-skipped button-row">
                          <span className="text-sm font-medium text-ink-soft">已略過</span>
                          <button type="button" data-step-restore aria-label={`還原：${step.title}`} onClick={() => skip(item.step, false)} className="btn-ghost btn-sm">
                            還原
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** 做完是打勾 略過是減號 其他寫第幾步 略過的樣子由 CSS 切換 */
function StepMark({ done, number, skippable }: { done: boolean; number: number; skippable: boolean }) {
  if (done) return <Icon name="circle-check" className="size-7 shrink-0 text-success" />;
  return (
    <>
      <span aria-hidden="true" className="fin-step-todo fin-step-number">
        {number}
      </span>
      {skippable && <Icon name="circle-minus" className="fin-step-skipped size-7 shrink-0 text-ink-soft" />}
    </>
  );
}
