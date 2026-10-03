// 通所受給者証 四面（障害児相談支援給付費の支給内容）の parser。
//
// 様式9：支給期間（年月まで）／指定相談支援事業所名／モニタリング期間／予備欄。
// 既存キー supportPeriod / planOfficeName / monitoringPeriod を流用し、
// 予備欄は二・三・五面と区別できる consultationMemo に入れる。
import type { FormDataType } from "../../../app/t/[tenantId]/types/cert";
import { findEraDayPeriod, findEraMonthPeriod } from "../period.ts";
import {
  collectValueLines,
  findLabelIndexes,
  toFormData,
  toLines,
  type LabelDef,
} from "./helpers.ts";

const L: Record<"title" | "period" | "office" | "monitoring" | "memo", LabelDef> = {
  title: { key: "title", re: /相談支援給付費の支給内容/ },
  period: { key: "period", re: /支給期間/ },
  // 「指定相談支援事業所名」（様式9）。「指定障害児相談支援事業所名」等の表記も同じ欄として扱う
  office: { key: "office", re: /相談支援事業所名/ },
  monitoring: { key: "monitoring", re: /モニタリング期間/ },
  memo: { key: "memo", re: /予備欄/ },
};

const ALL_LABELS: readonly LabelDef[] = Object.values(L);

function valueOf(lines: readonly string[], label: LabelDef, join: string): string {
  const idx = findLabelIndexes(lines, label)[0];
  if (idx === undefined) return "";
  return collectValueLines(lines, idx, label, ALL_LABELS).join(join).trim();
}

/** 四面の OCR テキスト（normalizeText 済み）を formData に変換する */
export function parseTsushoFace4(text: string): FormDataType {
  const lines = toLines(text);

  const periodRaw = valueOf(lines, L.period, " ");
  const supportPeriod =
    findEraMonthPeriod(periodRaw) ||
    findEraDayPeriod(periodRaw) ||
    (/\d/.test(periodRaw.normalize("NFKC")) ? periodRaw : "");

  return toFormData({
    supportPeriod,
    planOfficeName: valueOf(lines, L.office, " "),
    monitoringPeriod: valueOf(lines, L.monitoring, " "),
    consultationMemo: valueOf(lines, L.memo, "\n"),
  });
}
