// 受給者証の値とカルテの値を「比較するためだけ」の正規化。
// ここで作った値を画面表示・保存に使ってはいけない（原文はそのまま保持する）。
import { normalizeDateText } from "../beneficiaryChart/dates.ts";

// ハイフン・長音として使われる文字。
// 既存の OCR 前処理（lib/parsers/normalizeText.ts）は「‐－―ー」を "-" に置き換えるため、
// OCR 由来のフリガナでは長音「ー」が "-" になっている。比較時はこれらを同一視する。
const DASH_LIKE_RE = /[-‐‑‒–—―−－ー]/g;

/** 氏名・事業所名：NFKC＋空白除去 */
export function normalizeNameForCompare(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s/g, "");
}

/** フリガナ：NFKC＋空白除去＋ひらがな→カタカナ＋長音・ハイフン類の統一 */
export function normalizeFuriganaForCompare(value: string | null | undefined): string {
  return normalizeNameForCompare(value)
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(DASH_LIKE_RE, "ー");
}

/** 住所：NFKC＋空白除去＋ハイフン類（‐ － ー − 等）の統一 */
export function normalizeAddressForCompare(value: string | null | undefined): string {
  return normalizeNameForCompare(value).replace(DASH_LIKE_RE, "-");
}

/** 日付：和暦・西暦・ISO を "YYYY-MM-DD" に。読めなければ null（既存の normalizeDateText を使う） */
export function normalizeDateForCompare(value: string | null | undefined): string | null {
  return normalizeDateText(value ?? "");
}
