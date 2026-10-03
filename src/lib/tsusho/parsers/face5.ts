// 通所受給者証 五面（利用者負担に関する事項）の parser。
//
// 様式9の並び：負担上限月額 → 適用期間 → 食事提供加算対象者 → 適用期間
//              → 利用者負担上限額管理対象者該当の有無 → 利用者負担上限額管理事業所名 → 特記事項欄 → 予備欄
// 「適用期間」は2回出てくるため、直前の見出し（負担上限月額／食事提供加算対象者）との位置関係で振り分ける。
// 特記事項欄の印字（「・第２子（第３子以降）軽減対象児童」等）が実物で印字なのか記入なのかは未確認のため、
// 原文のまま burdenSpecialNotes に残す。
import type { FormDataType } from "../../../app/t/[tenantId]/types/cert";
import { findEraDayPeriod } from "../period.ts";
import {
  collectValueLines,
  findLabelIndexes,
  toFormData,
  toLines,
  type LabelDef,
} from "./helpers.ts";

const L: Record<
  "title" | "limit" | "period" | "meal" | "mgmtTarget" | "mgmtOffice" | "notes" | "memo",
  LabelDef
> = {
  title: { key: "title", re: /利用者負担に関する事項/ },
  limit: { key: "limit", re: /負担上限月額/ },
  period: { key: "period", re: /適用期間/ },
  // 様式9は「食事提供加算対象者」。様式11の「食事提供体制加算対象者」表記も同じ欄として扱う
  meal: { key: "meal", re: /食事提供(?:体制)?加算対象者/ },
  mgmtTarget: { key: "mgmtTarget", re: /上限額管理対象者(?:該当の有無)?/ },
  mgmtOffice: { key: "mgmtOffice", re: /上限額管理事業所名/ },
  notes: { key: "notes", re: /特記事項欄?/ },
  memo: { key: "memo", re: /予備欄/ },
};

const ALL_LABELS: readonly LabelDef[] = Object.values(L);

function valueAt(lines: readonly string[], idx: number | undefined, label: LabelDef, join: string, end?: number): string {
  if (idx === undefined) return "";
  return collectValueLines(lines, idx, label, ALL_LABELS, end).join(join).trim();
}

function periodValue(lines: readonly string[], idx: number | undefined): string {
  const raw = valueAt(lines, idx, L.period, " ");
  return findEraDayPeriod(raw) || (/\d/.test(raw.normalize("NFKC")) ? raw : "");
}

function amountValue(raw: string): string {
  const m = raw.normalize("NFKC").match(/\d[\d,]*\s*円/);
  return m ? m[0].replace(/\s+/g, "") : "";
}

/** 五面の OCR テキスト（normalizeText 済み）を formData に変換する */
export function parseTsushoFace5(text: string): FormDataType {
  const lines = toLines(text);

  const limitIdx = findLabelIndexes(lines, L.limit)[0];
  const mealIdx = findLabelIndexes(lines, L.meal)[0];
  const mgmtTargetIdx = findLabelIndexes(lines, L.mgmtTarget)[0];
  const mgmtOfficeIdx = findLabelIndexes(lines, L.mgmtOffice)[0];
  const notesIdx = findLabelIndexes(lines, L.notes)[0];
  const memoIdx = findLabelIndexes(lines, L.memo)[0];
  const periodIdxs = findLabelIndexes(lines, L.period);

  const afterLimit = limitIdx ?? -1;
  const beforeMeal = mealIdx ?? mgmtTargetIdx ?? Number.POSITIVE_INFINITY;
  const burdenPeriodIdx = periodIdxs.find((i) => i > afterLimit && i < beforeMeal);

  const mealPeriodIdx =
    mealIdx === undefined
      ? undefined
      : periodIdxs.find((i) => i > mealIdx && i < (mgmtTargetIdx ?? Number.POSITIVE_INFINITY));

  return toFormData({
    burdenLimitAmount: amountValue(valueAt(lines, limitIdx, L.limit, " ")),
    burdenPeriod: periodValue(lines, burdenPeriodIdx),
    mealProvisionStatus: valueAt(lines, mealIdx, L.meal, " "),
    mealProvisionPeriod: periodValue(lines, mealPeriodIdx),
    managementTargetStatus: valueAt(lines, mgmtTargetIdx, L.mgmtTarget, " "),
    managementOfficeName: valueAt(lines, mgmtOfficeIdx, L.mgmtOffice, " "),
    burdenSpecialNotes: valueAt(lines, notesIdx, L.notes, "\n"),
    burdenMemo: valueAt(lines, memoIdx, L.memo, "\n"),
  });
}
