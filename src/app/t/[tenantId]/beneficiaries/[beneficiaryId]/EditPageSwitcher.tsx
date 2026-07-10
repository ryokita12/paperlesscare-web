"use client";

import { PAGE_DEFINITIONS } from "../../constants/certPages";

type Props = {
  pages: { storagePath: string }[];
  activePageIndex: number;
  onChangePage: (index: number) => void;
};

export default function EditPageSwitcher({ pages, activePageIndex, onChangePage }: Props) {
  return (
    <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
      {PAGE_DEFINITIONS.map((def, index) => {
        const active = index === activePageIndex;
        const hasImage = !!pages[index]?.storagePath;

        return (
          <button
            key={def.pageNo}
            type="button"
            onClick={() => onChangePage(index)}
            title={def.title}
            className={`relative rounded-xl border px-2 py-2 text-xs font-semibold transition ${
              active
                ? "border-black bg-black text-white"
                : "bg-white hover:bg-zinc-50"
            }`}
          >
            {def.pageNo}
            <span
              className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-white ${
                hasImage ? "bg-emerald-500" : "bg-zinc-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
