"use client";

// 「受給者証を登録する」→「登録済みの利用者」：利用者を検索して選ぶ。
// 選んだ後は「誰に登録するのか」を大きく表示してから撮影へ進む（?id= で確認表示。端末の戻るで一覧に戻れる）。
// OCR結果から利用者を自動で決めることはしない。対象はスタッフがここで明示的に選んだ利用者だけ。
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getBeneficiary,
  type BeneficiaryRecord,
} from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import BeneficiaryPicker, { hasCertificate } from "../BeneficiaryPicker";
import { useLineStaff } from "../../LineSessionProvider";
import { beneficiaryDisplayName, beneficiaryFurigana } from "../../lib/beneficiarySearch";
import {
  friendlyErrorMessage,
  IconCamera,
  IconUser,
  LineButton,
  LineCenteredMessage,
  LinePageHeader,
  LineSpinner,
} from "../../ui";

const SELECT_PATH = "/line/beneficiaries/select";

function ConfirmTarget({ beneficiaryId }: { beneficiaryId: string }) {
  const { tenantId } = useLineStaff();
  const [record, setRecord] = useState<BeneficiaryRecord | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getBeneficiary(tenantId, beneficiaryId)
      .then((r) => {
        if (cancelled) return;
        if (!r || r.status === "inactive") {
          setState("notFound");
          return;
        }
        setRecord(r);
        setState("ready");
      })
      .catch((e: unknown) => {
        console.error("[line] getBeneficiary failed", e);
        if (cancelled) return;
        setError(friendlyErrorMessage(e));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, beneficiaryId]);

  if (state === "loading") return <LineSpinner />;
  if (state !== "ready" || !record) {
    return (
      <LineCenteredMessage
        tone="error"
        title={state === "notFound" ? "利用者が見つかりません" : "利用者を読み込めませんでした"}
        body={state === "notFound" ? "一覧から選び直してください。" : error}
        action={{ label: "利用者を選び直す", href: SELECT_PATH }}
      />
    );
  }

  const name = beneficiaryDisplayName(record);
  const furigana = beneficiaryFurigana(record);
  const updating = hasCertificate(record);

  return (
    <div className="space-y-7">
      <LinePageHeader back={{ href: SELECT_PATH, label: "選び直す" }} title="この利用者でよろしいですか？" />

      <div className="flex flex-col items-center rounded-3xl bg-white px-6 py-8 text-center shadow-sm ring-1 ring-zinc-200/60">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <IconUser className="h-9 w-9" />
        </div>
        {furigana && <div className="mt-4 text-base text-zinc-500">{furigana}</div>}
        <div className={`${furigana ? "mt-1" : "mt-4"} text-[1.75rem] font-bold leading-snug break-words`}>
          {name ? `${name}さん` : "氏名未登録"}
        </div>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          この利用者の受給者証を
          <br />
          {updating ? "更新します" : "登録します"}
        </p>
        {updating && (
          <p className="mt-2 text-sm text-zinc-500">今の受給者証は履歴として残ります</p>
        )}
      </div>

      <div className="space-y-3">
        <LineButton href={`/line/import?beneficiaryId=${encodeURIComponent(record.id)}&new=1`}>
          <IconCamera className="h-6 w-6" />
          受給者証を撮影する
        </LineButton>
        <LineButton variant="ghost" href={SELECT_PATH}>
          別の利用者を選ぶ
        </LineButton>
      </div>
    </div>
  );
}

function SelectContent() {
  const selectedId = useSearchParams().get("id");
  if (selectedId) return <ConfirmTarget key={selectedId} beneficiaryId={selectedId} />;

  return (
    <div className="space-y-5">
      <LinePageHeader back={{ href: "/line/import/start", label: "戻る" }} title="利用者を選択" />
      <BeneficiaryPicker hrefFor={(b) => `${SELECT_PATH}?id=${encodeURIComponent(b.id)}`} />
    </div>
  );
}

export default function LineSelectBeneficiaryPage() {
  return (
    <Suspense fallback={<LineSpinner />}>
      <SelectContent />
    </Suspense>
  );
}
