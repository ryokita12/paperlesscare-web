// 通所受給者証 parser の共通ヘルパ（行・ラベル単位の文字列処理）。
//
// parser に渡すテキストは、既存の parseCertText と同じく normalizeText 済みを前提とする
// （将来 CERT_PAGE_PARSERS に登録したとき、parseCertText が normalizeText してから呼ぶため）。
import { emptyFormData } from "../../../app/t/[tenantId]/constants/certPages.ts";
import type { FormDataType } from "../../../app/t/[tenantId]/types/cert";

export type LabelDef = { key: string; re: RegExp };

/**
 * OCR で2行に分かれやすいラベルを1行に戻す。
 * 例：「氏」「名 架空 花子」→「氏名 架空 花子」、「負担上限」「月額」→「負担上限月額」
 */
const SPLIT_LABELS: readonly [string, string][] = [
  ["氏", "名"],
  ["負担上限", "月額"],
];

// 既存の OCR 前処理（lib/parsers/normalizeText.ts）は「‐－―ー」をすべて "-" に置き換えるため、
// 「センター」「ユーキ」「サポート」が「センタ-」「ユ-キ」「サポ-ト」になる。
// カタカナの直後にあり、かつ直後がカタカナ・行末・空白・閉じ括弧の "-" は長音「ー」だった可能性が
// 極めて高いため、ここでだけ「ー」に戻す。数字の前の "-"（「ハイツ-101」等）は戻さない。
// （既存の normalizeText 自体は adult と共有しているため変更しない）
const KATAKANA_LONG_VOWEL_RE = /(?<=[ァ-ヺ])-(?=[ァ-ヺ]|$|\s|[)）」』])/g;

export function restoreKatakanaLongVowel(line: string): string {
  return line.replace(KATAKANA_LONG_VOWEL_RE, "ー");
}

export function toLines(text: string): string[] {
  const lines = (text ?? "")
    .split("\n")
    .map((v) => restoreKatakanaLongVowel(v.trim()))
    .filter(Boolean);

  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const pair = SPLIT_LABELS.find(([head, tail]) => lines[i] === head && lines[i + 1]?.startsWith(tail));
    if (pair) {
      merged.push(lines[i] + lines[i + 1]);
      i++;
      continue;
    }
    merged.push(lines[i]);
  }
  return merged;
}

/** その行がいずれかのラベルを含むか */
export function isLabelLine(line: string, labels: readonly LabelDef[]): boolean {
  return labels.some((l) => l.re.test(line));
}

/** 行の中で、指定ラベルの直後から（同じ行にある次のラベルの手前まで）を返す */
export function restAfterLabel(line: string, label: LabelDef, labels: readonly LabelDef[]): string {
  const m = label.re.exec(line);
  if (!m) return "";
  let rest = line.slice(m.index + m[0].length);

  let cut = rest.length;
  for (const other of labels) {
    const om = other.re.exec(rest);
    if (om && om.index < cut) cut = om.index;
  }
  rest = rest.slice(0, cut);
  return rest.trim();
}

/** ラベル行の行番号をすべて返す */
export function findLabelIndexes(lines: readonly string[], label: LabelDef): number[] {
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (label.re.test(line)) out.push(i);
  });
  return out;
}

/**
 * ラベルの値を集める：ラベル行の残り＋続く行（次のラベル行・終端行の手前まで）。
 * end は「ここより前まで」の行番号（省略時は末尾）。
 */
export function collectValueLines(
  lines: readonly string[],
  labelIndex: number,
  label: LabelDef,
  labels: readonly LabelDef[],
  end: number = lines.length
): string[] {
  const values: string[] = [];
  const rest = restAfterLabel(lines[labelIndex], label, labels);
  if (rest) values.push(rest);

  for (let i = labelIndex + 1; i < end; i++) {
    if (isLabelLine(lines[i], labels)) break;
    values.push(lines[i]);
  }
  return values;
}

/** 既存の formData 形（FormDataType）に tsusho のキーを足して返す */
export function toFormData(values: Record<string, string>): FormDataType {
  return { ...emptyFormData(), ...values };
}
