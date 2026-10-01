"use client";

// LINEスタッフ版の受給者証取込画面（見た目だけ）。
// 撮影・OCR・取込中状態の保持・保存の処理はすべて CertImportFlow（管理Webと共通）が持ち、
// この画面は CertImportFlow から state と操作を受け取って、スマートフォン向けの手順で表示する：
//   受給者証の色を選ぶ → ページごとに撮影（自動で読み取り）→ 内容を確認 → 登録
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CertPage } from "@/app/t/[tenantId]/types/cert";
import {
  CERT_TYPES,
  PAGE_COUNT,
  getPageDefinitions,
  type CertTypeId,
} from "@/app/t/[tenantId]/constants/certPages";
import CertLayoutRenderer from "@/app/t/[tenantId]/components/certLayouts";
import { isNameMismatch } from "../lib/beneficiarySearch";
import {
  friendlyErrorMessage,
  IconCamera,
  IconCheck,
  IconImage,
  LineBackLink,
  LineButton,
  LineCenteredMessage,
  LineNotice,
  LineSpinner,
} from "../ui";

type Step = "type" | "capture" | "review";

export type LineCertImportViewProps = {
  authLoading: boolean;
  signedIn: boolean;
  // 既存利用者への登録・更新の場合のみ
  target: { id: string; name: string; hasCertificate: boolean } | null;
  targetLoading: boolean;
  certType: CertTypeId;
  onChangeCertType: (certType: CertTypeId) => void;
  pages: CertPage[];
  activePageIndex: number;
  onChangePage: (index: number) => void;
  busy: boolean;
  compressing: boolean;
  ocrError: unknown;
  onFileChosen: (file: File | null) => void;
  onRetryOcr: () => void;
  onChangeField: (field: keyof CertPage["formData"], value: string) => void;
  saving: boolean;
  saveError: unknown;
  saved: boolean;
  onSave: () => void;
  // 取込中の内容（一時保存）を破棄する。画面遷移は呼び出し側の Link で行う
  onDiscard: () => void;
};

// 受給者証の色（スタッフは種別名より色で見分けている）
const TYPE_SWATCH: Partial<Record<CertTypeId, { swatch: string; color: string; age: string }>> = {
  adult: { swatch: "bg-violet-300", color: "紫色", age: "18歳以上" },
  child: { swatch: "bg-lime-300", color: "黄緑色", age: "18歳未満" },
};

// 1ページ目で確認してもらう主な項目（受給者証（Ⅰ））
const KEY_FIELDS: { field: keyof CertPage["formData"]; label: string; inputMode?: "numeric" }[] = [
  { field: "name", label: "氏名" },
  { field: "furigana", label: "フリガナ" },
  { field: "number", label: "受給者番号", inputMode: "numeric" },
  { field: "birthday", label: "生年月日" },
  { field: "issueDate", label: "交付年月日" },
  { field: "cityName", label: "支給市町村" },
];

function hasImage(page: CertPage): boolean {
  return !!page.selectedFile;
}

export default function LineCertImportView(props: LineCertImportViewProps) {
  const {
    authLoading,
    signedIn,
    target,
    targetLoading,
    certType,
    onChangeCertType,
    pages,
    activePageIndex,
    onChangePage,
    busy,
    compressing,
    ocrError,
    onFileChosen,
    onRetryOcr,
    onChangeField,
    saving,
    saveError,
    saved,
    onSave,
    onDiscard,
  } = props;

  // 撮影の途中で再読み込みした場合は、撮影の続きから表示する
  const [step, setStep] = useState<Step>(() =>
    pages.some((p) => p.ocrText || p.selectedFile) ? "capture" : "type"
  );
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);

  // 手順・ページを切り替えたら画面の先頭から見せる
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, activePageIndex]);

  if (authLoading) return <LineSpinner />;
  if (!signedIn) {
    return (
      <LineCenteredMessage
        tone="error"
        title="ログインが必要です"
        body="LINEからもう一度開いてください。"
        action={{ label: "ホームに戻る", href: "/line/home" }}
      />
    );
  }
  if (saved) return <LineSpinner label="登録しました" />;

  const isExisting = !!target;
  const cancelHref = target ? `/line/beneficiaries/${target.id}` : "/line/import/start";
  const pageDefs = getPageDefinitions(certType);
  const page = pages[activePageIndex];
  const pageDef = pageDefs[activePageIndex];
  const capturedCount = pages.filter(hasImage).length;
  const working = busy || compressing;
  const isLast = activePageIndex === PAGE_COUNT - 1;
  const firstPage = pages[0]?.formData;
  const ocrName = firstPage?.name ?? "";
  const mismatch = isExisting && isNameMismatch(target.name, ocrName);
  const missingNewName = !isExisting && !ocrName.trim();

  const openCamera = () => {
    if (!working) cameraInputRef.current?.click();
  };
  const openPicker = () => {
    if (!working) pickerInputRef.current?.click();
  };

  // 誰の受給者証を登録しているのかを、どの手順でも上部に表示する
  const targetBadge = (
    <div>
      <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-emerald-800">
        <span className="truncate">
          {isExisting
            ? targetLoading
              ? "利用者を確認しています"
              : `${target.name || "氏名未登録"}さん`
            : "新しい利用者"}
        </span>
      </div>
    </div>
  );

  const cancelBlock = confirmCancel ? (
    <div className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60">
      <div className="text-base font-bold">登録をやめますか？</div>
      <p className="text-[0.95rem] text-zinc-600">撮影した内容は保存されません。</p>
      <div className="grid grid-cols-2 gap-3">
        <LineButton variant="secondary" onClick={() => setConfirmCancel(false)}>
          続ける
        </LineButton>
        <Link
          href={cancelHref}
          onClick={onDiscard}
          className="flex min-h-14 items-center justify-center rounded-2xl bg-zinc-100 px-4 text-[1.05rem] font-bold text-zinc-700 active:bg-zinc-200"
        >
          やめる
        </Link>
      </div>
    </div>
  ) : (
    <LineButton variant="ghost" onClick={() => setConfirmCancel(true)} disabled={working || saving}>
      登録をやめる
    </LineButton>
  );

  const fileInputs = (
    <>
      {/* 端末標準のカメラを直接起動する（LINE内ブラウザでも確実に動く） */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFileChosen(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={pickerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFileChosen(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </>
  );

  // ---------- 1. 受給者証の色を選ぶ ----------
  if (step === "type") {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <LineBackLink href={cancelHref} label="戻る" />
          {targetBadge}
          <div className="px-1">
            <h1 className="text-[1.6rem] font-bold leading-snug">受給者証の色は？</h1>
            <p className="mt-1.5 text-base text-zinc-600">お手元の受給者証の色を選んでください</p>
          </div>
        </div>

        <div className="space-y-4">
          {CERT_TYPES.filter((t) => t.enabled).map((t) => {
            const look = TYPE_SWATCH[t.id];
            const active = t.id === certType;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChangeCertType(t.id);
                  setStep("capture");
                }}
                className={`flex w-full items-center gap-4 rounded-3xl bg-white px-5 py-5 text-left shadow-sm transition active:scale-[0.98] ${
                  active ? "ring-2 ring-emerald-500" : "ring-1 ring-zinc-200/70"
                }`}
              >
                <span className={`h-16 w-12 shrink-0 rounded-xl ${look?.swatch ?? "bg-zinc-200"} shadow-inner`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-bold">{look?.color ?? t.colorName}</span>
                  <span className="mt-0.5 block text-base text-zinc-600">{look?.age ?? t.label}</span>
                </span>
                {active && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <IconCheck className="h-5 w-5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- 3. 内容を確認して登録 ----------
  if (step === "review") {
    const typeLook = TYPE_SWATCH[certType];
    const canSave = capturedCount > 0 && !missingNewName && (!mismatch || mismatchConfirmed) && !saving;

    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <LineBackLink onClick={() => setStep("capture")} label="撮影に戻る" />
          {targetBadge}
          <div className="px-1">
            <h1 className="text-[1.6rem] font-bold leading-snug">内容を確認して登録</h1>
            <p className="mt-1.5 text-base text-zinc-600">
              {isExisting
                ? target.hasCertificate
                  ? "新しい受給者証に更新します。今の受給者証は履歴として残ります。"
                  : "この利用者に受給者証を登録します。"
                : "新しい利用者として登録します。"}
            </p>
          </div>
        </div>

        {mismatch && (
          <LineNotice tone="warning">
            <div className="font-bold">氏名が違うようです</div>
            <div className="mt-1">
              選んだ利用者：{target.name}さん
              <br />
              受給者証の氏名：{ocrName}
            </div>
            <label className="mt-3 flex min-h-11 items-center gap-3 font-semibold">
              <input
                type="checkbox"
                className="h-6 w-6 accent-amber-600"
                checked={mismatchConfirmed}
                onChange={(e) => setMismatchConfirmed(e.target.checked)}
              />
              この利用者で間違いありません
            </label>
          </LineNotice>
        )}

        {missingNewName && (
          <LineNotice tone="warning">
            氏名が入っていません。1ページ目に戻って、氏名を入力してください。
          </LineNotice>
        )}

        <div className="rounded-3xl bg-white px-5 py-3 shadow-sm ring-1 ring-zinc-200/60">
          <div className="flex items-center gap-3 border-b border-zinc-100 py-3">
            <span className={`h-9 w-7 shrink-0 rounded-md ${typeLook?.swatch ?? "bg-zinc-200"}`} />
            <div className="min-w-0">
              <div className="text-sm text-zinc-500">受給者証</div>
              <div className="text-base font-bold">
                {typeLook ? `${typeLook.color}（${typeLook.age}）` : certType}
              </div>
            </div>
          </div>
          {KEY_FIELDS.slice(0, 5).map(({ field, label }) => (
            <div key={field} className="border-b border-zinc-100 py-3 last:border-b-0">
              <div className="text-sm text-zinc-500">{label}</div>
              <div className="mt-0.5 break-words text-[1.05rem] font-semibold">
                {firstPage?.[field] || <span className="font-normal text-zinc-400">読み取れませんでした</span>}
              </div>
            </div>
          ))}
          <div className="py-3">
            <div className="text-sm text-zinc-500">撮影したページ</div>
            <div className="mt-0.5 text-[1.05rem] font-semibold">
              {capturedCount} / {PAGE_COUNT} ページ
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onChangePage(0);
            setStep("capture");
          }}
          className="w-full px-1 text-left text-base font-semibold text-emerald-700"
        >
          内容を直す場合は、ページに戻って修正できます ›
        </button>

        {!!saveError && (
          <LineNotice tone="error">
            {friendlyErrorMessage(saveError, "登録できませんでした。もう一度「登録する」を押してください。")}
          </LineNotice>
        )}

        <div className="space-y-3">
          <LineButton onClick={onSave} disabled={!canSave}>
            {saving ? "登録しています…" : "この内容で登録する"}
          </LineButton>
          {cancelBlock}
        </div>
      </div>
    );
  }

  // ---------- 2. ページごとに撮影 ----------
  const captured = hasImage(page);
  const readOk = captured && !working && !ocrError && !!page.ocrText;
  const readEmpty = captured && !working && !ocrError && !page.ocrText;

  return (
    <div className="space-y-5">
      {fileInputs}

      <div className="space-y-3">
        <LineBackLink
          onClick={() => (activePageIndex > 0 ? onChangePage(activePageIndex - 1) : setStep("type"))}
          label={activePageIndex > 0 ? "前のページ" : "色を選び直す"}
        />
        {targetBadge}
        <div className="px-1">
          <div className="text-base font-semibold text-emerald-700">
            {activePageIndex + 1} / {PAGE_COUNT} ページ目
          </div>
          <h1 className="mt-0.5 text-[1.5rem] font-bold leading-snug">{pageDef?.shortTitle ?? `ページ${activePageIndex + 1}`}</h1>
        </div>
      </div>

      {/* ページの切り替え（撮影済みは緑） */}
      <div className="flex justify-between gap-1" role="tablist" aria-label="ページ">
        {pages.map((p, i) => {
          const done = hasImage(p);
          const active = i === activePageIndex;
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${i + 1}ページ目${done ? "（撮影済み）" : ""}`}
              disabled={working}
              onClick={() => onChangePage(i)}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-base font-bold transition ${
                active
                  ? "bg-emerald-600 text-white shadow"
                  : done
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-white text-zinc-400 ring-1 ring-zinc-200"
              }`}
            >
              {done && !active ? <IconCheck className="h-5 w-5" /> : i + 1}
            </button>
          );
        })}
      </div>

      {/* 撮影する紙面（未撮影は見本、撮影後は撮った写真） */}
      <div className="relative overflow-hidden rounded-3xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/60">
        {captured && page.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.previewUrl}
            alt="撮影した受給者証"
            style={{ maxHeight: 256, width: "auto" }}
            className="mx-auto rounded-2xl object-contain"
          />
        ) : (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/cert-samples/${certType}/page-${activePageIndex + 1}.png`}
              alt=""
              // globals.css の img { height: auto } がレイヤー外で h-* より優先されるため style で指定する
              style={{ height: 144, width: "auto" }}
              className="shrink-0 rounded-xl ring-1 ring-zinc-200"
            />
            <div className="min-w-0 text-base leading-relaxed text-zinc-600">
              <div className="font-bold text-zinc-800">このページを撮影</div>
              <div className="mt-1 text-[0.95rem]">{pageDef?.title}</div>
              <div className="mt-2 text-sm text-zinc-500">明るい場所で、紙全体が入るように撮ってください</div>
            </div>
          </div>
        )}

        {working && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85 text-base font-semibold text-emerald-800">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-500" />
            {compressing ? "写真を準備しています" : "文字を読み取っています"}
          </div>
        )}
      </div>

      {captured && !working && (
        <>
          {readOk && (
            <LineNotice>
              <span className="font-bold">読み取りました。</span>内容を確認して、違うところは直してください。
            </LineNotice>
          )}
          {readEmpty && (
            <LineNotice tone="warning">文字を読み取れませんでした。明るい場所で撮り直すか、下の内容を入力してください。</LineNotice>
          )}
          {!!ocrError && (
            <LineNotice tone="error">
              <div>{friendlyErrorMessage(ocrError, "読み取りに失敗しました。もう一度お試しください。")}</div>
              <button type="button" onClick={onRetryOcr} className="mt-2 min-h-11 font-bold underline">
                もう一度読み取る
              </button>
            </LineNotice>
          )}
        </>
      )}

      {/* 1ページ目：主な項目を大きな入力欄で確認・修正 */}
      {captured && !working && activePageIndex === 0 && (
        <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60">
          <div className="text-lg font-bold">読み取った内容</div>
          {KEY_FIELDS.map(({ field, label, inputMode }) => (
            <label key={field} className="block">
              <span className="text-sm font-semibold text-zinc-600">{label}</span>
              <input
                className="mt-1.5 min-h-12 w-full rounded-xl bg-zinc-50 px-4 py-3 text-[1.05rem] outline-none ring-1 ring-zinc-200 focus:bg-white focus:ring-2 focus:ring-emerald-400"
                value={page.formData[field] ?? ""}
                inputMode={inputMode}
                onChange={(e) => onChangeField(field, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {/* すべての項目（帳票レイアウト）。管理Webと同じ部品で確認・修正する */}
      {captured && !working && (
        <details className="group rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200/60">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-base font-semibold text-zinc-700">
            {activePageIndex === 0 ? "そのほかの項目を確認・修正" : "読み取った内容を確認・修正"}
            <span className="text-zinc-400 transition group-open:rotate-90">›</span>
          </summary>
          <div className="overflow-x-auto px-3 pb-4">
            <div className="min-w-[340px] text-sm">
              <CertLayoutRenderer
                certType={certType}
                pageIndex={activePageIndex}
                pageTitle={pageDef?.title ?? ""}
                page={page}
                onChangeField={onChangeField}
              />
            </div>
          </div>
        </details>
      )}

      <div className="space-y-3 pt-1">
        {!captured ? (
          <>
            <LineButton onClick={openCamera} disabled={working}>
              <IconCamera className="h-6 w-6" />
              撮影する
            </LineButton>
            <LineButton variant="secondary" onClick={openPicker} disabled={working}>
              <IconImage className="h-6 w-6" />
              写真から選ぶ
            </LineButton>
            {activePageIndex > 0 && (
              <LineButton
                variant="ghost"
                disabled={working}
                onClick={() => (isLast ? setStep("review") : onChangePage(activePageIndex + 1))}
              >
                {isLast ? "このページはとばして確認へ" : "このページはとばす"}
              </LineButton>
            )}
          </>
        ) : (
          <>
            <LineButton
              disabled={working}
              onClick={() => (isLast ? setStep("review") : onChangePage(activePageIndex + 1))}
            >
              {isLast ? "内容を確認する" : "次のページへ"}
            </LineButton>
            <LineButton variant="secondary" onClick={openCamera} disabled={working}>
              <IconCamera className="h-6 w-6" />
              撮り直す
            </LineButton>
          </>
        )}

        {capturedCount > 0 && !isLast && (
          <LineButton variant="ghost" disabled={working} onClick={() => setStep("review")}>
            撮影を終えて確認へ（{capturedCount}ページ撮影済み）
          </LineButton>
        )}
      </div>

      <div className="border-t border-zinc-200/70 pt-3">{cancelBlock}</div>
    </div>
  );
}
