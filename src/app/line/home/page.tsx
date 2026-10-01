"use client";

// LINEスタッフTOP
import { useLineStaff } from "../LineSessionProvider";
import { LineButton } from "../ui";

export default function LineHomePage() {
  const { tenantName, staffName } = useLineStaff();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-emerald-100 bg-white px-6 py-6 shadow-sm">
        <div className="text-sm font-semibold text-emerald-700">{tenantName || "PaperlessCare"}</div>
        <div className="mt-3 text-2xl font-bold">{staffName}さん</div>
        <div className="mt-1 text-base text-zinc-600">お疲れさまです</div>
      </div>

      <div>
        <div className="mb-3 px-1 text-base font-bold">何をしますか？</div>
        <div className="space-y-4">
          <LineButton href="/line/import?new=1" className="py-6 text-lg">
            <span aria-hidden className="text-2xl">📷</span>
            受給者証を登録
          </LineButton>
          <LineButton href="/line/beneficiaries" variant="secondary" className="py-6 text-lg">
            <span aria-hidden className="text-2xl">👥</span>
            利用者を見る
          </LineButton>
        </div>
      </div>
    </div>
  );
}
