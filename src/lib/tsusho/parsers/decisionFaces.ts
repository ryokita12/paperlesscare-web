// 通所受給者証 二面・三面（障害児通所給付費の給付決定内容）の parser。
//
// 様式9では各面に「支援の種類／支給量等／給付決定期間」が2行ずつあり、
// その下に特記事項欄・予備欄がある。二面＝1・2行目、三面＝3・4行目として
// serviceTypeN / serviceAmountN / servicePeriodN に入れる。
//
// - 行は「支援の種類」ラベルを起点に区切る（サービス名の決め打ちはしない）
// - 給付決定期間は「年月日〜年月日」を読めた場合「…から…まで」に揃える。
//   読めないが数字を含む場合は原文を残す（スタッフが確認・修正できるように）。
//   印字だけの「令和 年 月 日から…」（数字なし）は空とする
// - 自治体の工夫で1面に3行以上ある場合、3行目以降は decisionNExtraRows に原文で残す（情報を捨てない）
import type { FormDataType } from "../../../app/t/[tenantId]/types/cert";
import { findEraDayPeriod } from "../period.ts";
import {
  collectValueLines,
  findLabelIndexes,
  toFormData,
  toLines,
  type LabelDef,
} from "./helpers.ts";

const L: Record<"title" | "kind" | "amount" | "period" | "notes" | "memo", LabelDef> = {
  title: { key: "title", re: /給付決定内容/ },
  kind: { key: "kind", re: /支援の種類/ },
  amount: { key: "amount", re: /支給量等/ },
  period: { key: "period", re: /給付決定期間/ },
  notes: { key: "notes", re: /特記事項欄?/ },
  memo: { key: "memo", re: /予備欄/ },
};

const ALL_LABELS: readonly LabelDef[] = Object.values(L);

function hasDigit(text: string): boolean {
  return /\d/.test(text.normalize("NFKC"));
}

function firstIndexIn(indexes: readonly number[], from: number, to: number): number | undefined {
  return indexes.find((i) => i > from && i < to);
}

type ParsedRow = { type: string; amount: string; period: string };

function parseRow(lines: readonly string[], start: number, end: number): ParsedRow {
  const type = collectValueLines(lines, start, L.kind, ALL_LABELS, end).join(" ");

  const amountIdx = firstIndexIn(findLabelIndexes(lines, L.amount), start, end);
  const amount =
    amountIdx === undefined ? "" : collectValueLines(lines, amountIdx, L.amount, ALL_LABELS, end).join("\n");

  const periodIdx = firstIndexIn(findLabelIndexes(lines, L.period), start, end);
  // ラベルが読めない場合も、この行の範囲内にある「年月日〜年月日」はこの行の期間とみなす
  const periodSource =
    periodIdx === undefined
      ? lines.slice(start, end).join(" ")
      : collectValueLines(lines, periodIdx, L.period, ALL_LABELS, end).join(" ");
  const periodRawFallback = periodIdx === undefined ? "" : periodSource;
  const period =
    findEraDayPeriod(periodSource) || (hasDigit(periodRawFallback) ? periodRawFallback.trim() : "");

  return { type: type.trim(), amount: amount.trim(), period };
}

function parseDecisionFace(text: string, face: 2 | 3): FormDataType {
  const lines = toLines(text);
  const firstRow = face === 2 ? 1 : 3;

  const notesIdx = findLabelIndexes(lines, L.notes)[0];
  const memoIdx = findLabelIndexes(lines, L.memo)[0];
  const rowsEnd = Math.min(notesIdx ?? lines.length, memoIdx ?? lines.length);
  const rowStarts = findLabelIndexes(lines, L.kind).filter((i) => i < rowsEnd);

  const values: Record<string, string> = {};
  const extraRows: string[] = [];

  rowStarts.forEach((start, k) => {
    const end = rowStarts[k + 1] ?? rowsEnd;
    if (k < 2) {
      const row = parseRow(lines, start, end);
      const n = firstRow + k;
      values[`serviceType${n}`] = row.type;
      values[`serviceAmount${n}`] = row.amount;
      values[`servicePeriod${n}`] = row.period;
    } else {
      extraRows.push(lines.slice(start, end).join("\n"));
    }
  });

  values[`decision${face}SpecialNotes`] =
    notesIdx === undefined
      ? ""
      : collectValueLines(lines, notesIdx, L.notes, ALL_LABELS, memoIdx !== undefined && memoIdx > notesIdx ? memoIdx : lines.length).join("\n");
  values[`decision${face}Memo`] =
    memoIdx === undefined ? "" : collectValueLines(lines, memoIdx, L.memo, ALL_LABELS).join("\n");
  values[`decision${face}ExtraRows`] = extraRows.join("\n\n");

  return toFormData(values);
}

/** 二面（1・2行目） */
export function parseTsushoFace2(text: string): FormDataType {
  return parseDecisionFace(text, 2);
}

/** 三面（3・4行目） */
export function parseTsushoFace3(text: string): FormDataType {
  return parseDecisionFace(text, 3);
}
