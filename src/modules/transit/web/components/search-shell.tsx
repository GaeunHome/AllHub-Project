"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { Icon } from "@/core/ui/icon";

type SearchEdit = { collapsed: boolean; toggle: () => void; finish: () => void };

const SearchEditContext = createContext<SearchEdit>({ collapsed: false, toggle: () => {}, finish: () => {} });

/**
 * 使用者要的 查到結果後表單收起來 按修改再打開
 * 沒有結果時沒有修改鈕 collapsible 要是 false
 */
export function SearchShell({ collapsible, children }: { collapsible: boolean; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const edit = { collapsed: collapsible && !editing, toggle: () => setEditing(!editing), finish: () => setEditing(false) };
  return <SearchEditContext value={edit}>{children}</SearchEditContext>;
}

export const useSearchEdit = () => use(SearchEditContext);

export function EditSearchButton({ className }: { className: string }) {
  const { collapsed, toggle } = useSearchEdit();
  return (
    <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls="transit-search" className={className}>
      <Icon name={collapsed ? "pencil" : "chevron-up"} className="size-4" />
      {collapsed ? "修改" : "收起"}
    </button>
  );
}
