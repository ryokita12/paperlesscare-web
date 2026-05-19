import { PAGE_DEFINITIONS } from "../constants/certPages";

type Props = {
  pages: { previewUrl: string }[];
  activePageIndex: number;
  onChangePage: (index: number) => void;
};

export default function PageTabs({
  pages,
  activePageIndex,
  onChangePage,
}: Props) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-sm font-semibold">②取り込むページを選択</div>

      <div className="flex gap-2">
        {pages.map((page, index) => {
          const done = !!page.previewUrl;
          const active = index === activePageIndex;
          const definition = PAGE_DEFINITIONS[index];

          return (
            <button
              key={index}
              type="button"
              onClick={() => onChangePage(index)}
              className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl border p-1 text-left transition-all duration-150 ${
                active
                  ? "border-black bg-white shadow-md ring-2 ring-black"
                  : done
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-zinc-200 bg-zinc-50 hover:bg-white"
              }`}
            >
              <div className="cert-thumbnail aspect-[2/3] w-full overflow-hidden rounded-xl border bg-white">
                <img
                  src={definition?.sampleImagePath}
                  alt={definition?.title || `ページ${index + 1}`}
                  className={`h-full w-full ${done ? "" : "opacity-70"}`}
                />
              </div>

              <div className="mt-1 flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold">
                    {index + 1}. {definition?.shortTitle || `ページ${index + 1}`}
                  </div>
                </div>

                {done && (
                  <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    済
                  </span>
                )}
              </div>

              {active && (
                <div className="absolute right-1 top-1 rounded-full bg-black px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  選択中
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}