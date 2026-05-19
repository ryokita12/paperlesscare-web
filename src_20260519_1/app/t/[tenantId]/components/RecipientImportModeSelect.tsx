// app/t/[tenantId]/components/RecipientImportModeSelect.tsx

type ImportMode = "new" | "update";

type Props = {
  onSelect: (mode: ImportMode) => void;
};

export default function RecipientImportModeSelect({ onSelect }: Props) {
  return (
    <div className="w-full max-w-[960px] mx-auto space-y-5">
      <div>
        <div className="text-xl font-bold">受給者証取込＆送信</div>
        <div className="mt-2 text-sm text-zinc-500">
          取り込み方法を選択してください。
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect("new")}
          className="rounded-2xl border bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
            ＋
          </div>

          <div className="text-lg font-bold">新規受給者を登録</div>

          <div className="mt-2 text-sm leading-6 text-zinc-500">
            初めて登録する利用者の受給者証を取り込みます。
            OCR結果をもとに、新しい受給者情報を作成します。
          </div>

          <div className="mt-5 inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white">
            新規登録を開始
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect("update")}
          className="rounded-2xl border bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
            ↻
          </div>

          <div className="text-lg font-bold">既存受給者を更新</div>

          <div className="mt-2 text-sm leading-6 text-zinc-500">
            すでに登録済みの利用者を選択し、
            新しい受給者証情報で更新します。
          </div>

          <div className="mt-5 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">
            利用者を検索
          </div>
        </button>
      </div>
    </div>
  );
}