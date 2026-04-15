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
    <div className="mb-4 grid grid-cols-4 gap-2 md:flex md:gap-2">
      {pages.map((page, index) => {
        const done = !!page.previewUrl;
        const active = index === activePageIndex;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onChangePage(index)}
            className={`w-full rounded-xl border px-2 py-2 transition-all duration-150 ${
              active
                ? "bg-black text-white border-black text-base font-semibold shadow-sm scale-[1.04]"
                : "bg-white text-black text-sm"
            }`}
          >
            {index + 1} {done ? "●" : ""}
          </button>
        );
      })}
    </div>
  );
}