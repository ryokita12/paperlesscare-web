"use client";

// 「受給者証を登録する」の最初の画面：新しい利用者か、登録済みの利用者かを必ず選ばせる。
// （撮影・OCRへは、ここで対象を決めてから進む）
import { IconUser, IconUserPlus, LineChoiceTile, LinePageHeader } from "../../ui";

export default function LineImportStartPage() {
  return (
    <div className="space-y-7">
      <LinePageHeader
        back={{ href: "/line/home", label: "ホーム" }}
        title="受給者証を登録"
        subtitle="どなたの受給者証ですか？"
      />

      <div className="space-y-4">
        <LineChoiceTile
          href="/line/import?new=1"
          icon={<IconUserPlus className="h-8 w-8" />}
          title="新しい利用者"
          description="はじめて登録する方"
        />
        <LineChoiceTile
          href="/line/beneficiaries/select"
          icon={<IconUser className="h-8 w-8" />}
          title="登録済みの利用者"
          description="受給者証の更新・追加"
        />
      </div>
    </div>
  );
}
