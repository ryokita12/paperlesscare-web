"use client";

// LINEスタッフTOP。主要な操作は「受給者証を登録する」「利用者を確認する」の2つだけ。
import { useLineStaff } from "../LineSessionProvider";
import { IconCamera, IconUsers, LineChoiceTile } from "../ui";

export default function LineHomePage() {
  const { tenantName, staffName } = useLineStaff();

  return (
    <div className="space-y-8 pt-2">
      <div className="px-1">
        {tenantName && <div className="text-sm font-semibold text-emerald-700">{tenantName}</div>}
        <div className="mt-2 text-[1.6rem] font-bold leading-snug break-words">こんにちは、{staffName}さん</div>
        <div className="mt-1 text-lg text-zinc-600">今日は何をしますか？</div>
      </div>

      <div className="space-y-4">
        <LineChoiceTile
          href="/line/import/start"
          emphasis
          icon={<IconCamera className="h-8 w-8" />}
          title="受給者証を登録する"
          description="写真を撮ってかんたん登録"
        />
        <LineChoiceTile
          href="/line/beneficiaries"
          icon={<IconUsers className="h-8 w-8" />}
          title="利用者を確認する"
          description="登録済みの利用者を検索・確認"
        />
      </div>
    </div>
  );
}
