// 通所受給者証の和暦日付・期間の読み取り（純粋関数）。
//
// 既存の parseWarekiPeriod / parseWarekiDate（certificateModel.ts）を変更せずに再利用し、
// 実在しない日付（2月30日 等）は既存の normalizeDateText で弾く。
// 既存の ERA_DATE_RE（lib/parsers/common/helpers.ts）は「元年」に対応していないため、
// 令和元年生まれの児童を扱う通所受給者証では、ここで「元」を含む正規表現を使う。
import { parseWarekiPeriod } from "../../app/t/[tenantId]/lib/firestore/certificateModel.ts";
import { normalizeDateText } from "../beneficiaryChart/dates.ts";

const ERA = "(?:昭和|平成|令和)";
const ERA_YEAR = "(?:元|\\d{1,2})";

/** 和暦の年月日（桁や単位の間の空白を許容） */
export const TSUSHO_ERA_DATE_RE = new RegExp(
  `${ERA}\\s*${ERA_YEAR}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日`
);

/** 和暦の年月日〜年月日の期間（区切りは「から」「~」「〜」） */
const ERA_DAY_PERIOD_RE = new RegExp(
  `(${ERA}\\s*${ERA_YEAR}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日)\\s*(?:から|~|〜)\\s*(${ERA}\\s*${ERA_YEAR}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日)(?:\\s*まで)?`
);

/** 和暦の年月〜年月の期間（四面「支給期間」は年月まで） */
const ERA_MONTH_PERIOD_RE = new RegExp(
  `(${ERA}\\s*${ERA_YEAR}\\s*年\\s*\\d{1,2}\\s*月)\\s*(?:から|~|〜)\\s*(${ERA}\\s*${ERA_YEAR}\\s*年\\s*\\d{1,2}\\s*月)(?:\\s*まで)?`
);

/** 照合の前処理：全角数字・全角チルダ等を NFKC で揃える（照合専用。原文は書き換えない） */
function forMatch(text: string): string {
  return (text ?? "").normalize("NFKC");
}

function compact(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 文字列中の最初の和暦日付を「令和8年4月1日」形式（空白なし・半角数字）で返す。無ければ "" */
export function findEraDate(text: string): string {
  const m = forMatch(text).match(TSUSHO_ERA_DATE_RE);
  return m ? compact(m[0]) : "";
}

/**
 * 文字列中の最初の「年月日〜年月日」期間を「令和8年4月1日から令和9年3月31日まで」形式で返す。無ければ ""
 * （区切り記号の違いを「から…まで」へ揃えるのは、既存の parseWarekiPeriod で読める形にするため）
 */
export function findEraDayPeriod(text: string): string {
  const m = forMatch(text).match(ERA_DAY_PERIOD_RE);
  return m ? `${compact(m[1])}から${compact(m[2])}まで` : "";
}

/** 文字列中の最初の「年月〜年月」期間を「令和8年4月から令和9年3月まで」形式で返す。無ければ "" */
export function findEraMonthPeriod(text: string): string {
  const m = forMatch(text).match(ERA_MONTH_PERIOD_RE);
  return m ? `${compact(m[1])}から${compact(m[2])}まで` : "";
}

/**
 * 給付決定期間などの「年月日〜年月日」を ISO の開始日・終了日に変換する。
 * - 期間として読めない、実在しない日付を含む、開始日が終了日より後 → 両方 null
 *   （片方が誤読なら期間全体が信用できないため、片方だけを返すことはしない）
 */
export function parseTsushoDayPeriod(text: string): {
  validFrom: string | null;
  validTo: string | null;
} {
  const period = findEraDayPeriod(text);
  if (!period) return { validFrom: null, validTo: null };

  const raw = parseWarekiPeriod(period);
  const validFrom = raw.validFrom ? normalizeDateText(raw.validFrom) : null;
  const validTo = raw.validTo ? normalizeDateText(raw.validTo) : null;

  if (!validFrom || !validTo || validFrom > validTo) {
    return { validFrom: null, validTo: null };
  }
  return { validFrom, validTo };
}
