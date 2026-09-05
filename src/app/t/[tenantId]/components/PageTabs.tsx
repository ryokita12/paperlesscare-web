import { getPageDefinitions, type CertTypeId } from "../constants/certPages";

type Props = {
  pages: { previewUrl: string }[];
  activePageIndex: number;
  selectedCertType: CertTypeId;
  onChangePage: (index: number) => void;
};

export default function PageTabs({
  pages,
  activePageIndex,
  selectedCertType,
  onChangePage,
}: Props) {
  const pageDefinitions = getPageDefinitions(selectedCertType);

  const renderPageButton = (page: { previewUrl: string }, index: number) => {
    // 画像は確定保存時までStorageへアップロードしないため、storagePathは判定に使わない。
    // previewUrl（blob:）はページ再読み込み・セッション復元をまたぐと消えるため、
    // その場合は意図どおり「未取込」に戻る。
    const done = !!page.previewUrl;
    const active = index === activePageIndex;
    const definition = pageDefinitions[index];

    return (
      <button
        key={index}
        type="button"
        onClick={() => onChangePage(index)}
        className={`relative w-[88px] shrink-0 overflow-hidden rounded-xl border p-1 text-left transition-all duration-150 ${
          active
            ? "border-black bg-white shadow-md ring-2 ring-black"
            : done
              ? "border-emerald-300 bg-emerald-50"
              : "border-zinc-200 bg-white hover:bg-zinc-50"
        }`}
      >
        <div className="cert-thumbnail aspect-[2/3] w-full overflow-hidden rounded-lg border bg-white">
          <img
            src={`/cert-samples/${selectedCertType}/page-${index + 1}.png`}
            alt={definition?.title || `ページ${index + 1}`}
            className={`h-full w-full ${done ? "" : "opacity-70"}`}
          />
        </div>

        <div className="mt-1 flex items-start justify-between gap-1 pl-1">
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
  };

  return (
    <div className="mb-5">
      <div className="mb-3 text-sm font-semibold">②取り込むページを選択</div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-zinc-100 p-3">
          <div className="mb-2 text-center text-xs font-semibold text-zinc-500">
            上段（1〜4ページ）
          </div>

          <div className="grid grid-cols-4 justify-items-center gap-3">
            {pages.slice(0, 4).map((page, index) =>
              renderPageButton(page, index)
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-100 p-3">
          <div className="mb-2 text-center text-xs font-semibold text-zinc-500">
            下段（5〜8ページ）
          </div>

          <div className="grid grid-cols-4 justify-items-center gap-3">
            {pages.slice(4, 8).map((page, index) =>
              renderPageButton(page, index + 4)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}