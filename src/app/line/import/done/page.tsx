"use client";

// 受給者証の登録完了（新規利用者・既存利用者の両方）。
// CertImportFlow の保存成功後に ?beneficiaryId=&mode=new|update で遷移してくる。
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBeneficiary } from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import { useLineStaff } from "../../LineSessionProvider";
import { IconCheck, LineButton, LineSpinner } from "../../ui";

function DoneContent() {
  const { tenantId } = useLineStaff();
  const searchParams = useSearchParams();
  const beneficiaryId = searchParams.get("beneficiaryId") ?? "";
  const updated = searchParams.get("mode") === "update";
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!beneficiaryId) return;
    let cancelled = false;
    getBeneficiary(tenantId, beneficiaryId)
      .then((r) => {
        if (!cancelled) setName(r ? r.profile.name || r.summary.name || "" : "");
      })
      .catch(() => {
        // 名前が取れなくても完了の表示はできる
        if (!cancelled) setName("");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, beneficiaryId]);

  if (beneficiaryId && name === null) return <LineSpinner />;

  const who = name ? `${name}さん` : "利用者";

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <IconCheck className="h-14 w-14" strokeWidth={2.4} />
        </div>
        <h1 className="mt-6 text-[1.75rem] font-bold">登録しました</h1>
        <p className="mt-3 text-lg leading-relaxed text-zinc-700">
          <span className="font-bold break-words">{who}</span>の
          <br />
          受給者証を{updated ? "更新しました。" : "登録しました。"}
        </p>
        {updated && <p className="mt-2 text-base text-zinc-500">以前の受給者証は履歴に残っています</p>}
      </div>

      <div className="space-y-3">
        {beneficiaryId && (
          <LineButton href={`/line/beneficiaries/${encodeURIComponent(beneficiaryId)}`}>
            {name ? `${name}さんを確認する` : "利用者を確認する"}
          </LineButton>
        )}
        <LineButton variant="secondary" href="/line/home">
          ホームに戻る
        </LineButton>
      </div>
    </div>
  );
}

export default function LineImportDonePage() {
  return (
    <Suspense fallback={<LineSpinner />}>
      <DoneContent />
    </Suspense>
  );
}
