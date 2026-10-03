// 利用者カルテの日付まわりの純粋ロジック（Firebase非依存。node:test から直接テストする）。
//
// カルテで新しく保存する日付は "YYYY-MM-DD"（ISO形式の暦日）を正とする。
// 一方、既存データの生年月日は受給者証OCR由来の和暦文字列（"平成20年4月1日" 等）や
// 自由入力の文字列であるため、ここで読み取り時にだけ正規化する（保存済みの値は書き換えない）。
import { parseWarekiDate } from "../../app/t/[tenantId]/lib/firestore/certificateModel.ts";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 2月30日のような存在しない日付を弾く
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** "YYYY-MM-DD" 形式で、実在する日付かどうか */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = value.match(ISO_DATE_RE);
  return !!m && toIso(Number(m[1]), Number(m[2]), Number(m[3])) === value;
}

/**
 * 生年月日などの日付文字列を "YYYY-MM-DD" に正規化する。読み取れなければ null。
 * 対応：ISO（2015-05-10）、2015/5/10、2015.5.10、2015年5月10日、和暦（令和・平成・昭和、元年、全角数字）。
 */
export function normalizeDateText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").trim();
  if (!text) return null;

  const western = text.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (western) return toIso(Number(western[1]), Number(western[2]), Number(western[3]));

  const wareki = parseWarekiDate(text);
  if (!wareki) return null;
  const m = wareki.match(ISO_DATE_RE);
  return m ? toIso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** 端末のローカル日付を "YYYY-MM-DD" で返す */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "2015-05-10" → "2015年5月10日"。ISO形式でなければそのまま返す */
export function formatJapaneseDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(ISO_DATE_RE);
  if (!m) return iso;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 満年齢。生年月日が不正、または基準日より後なら null */
export function calcAge(birthDate: string | null | undefined, today: Date): number | null {
  if (!isIsoDate(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age >= 0 ? age : null;
}

export type SchoolGrade = {
  stage: "preschool" | "elementary" | "juniorHigh" | "highSchool" | "graduated";
  // 小学校・中学校・高校の何年生か（未就学・卒業後は 0）
  year: number;
  label: string;
};

/**
 * 生年月日から、標準的な就学（4月入学・4月2日〜翌年4月1日生まれが同学年）を前提とした学年を求める。
 * 留年・就学猶予・特別支援学校の学部等で実際と異なる場合があるため、カルテでは手動の学年を優先する。
 */
export function calcSchoolGrade(birthDate: string | null | undefined, today: Date): SchoolGrade | null {
  if (!isIsoDate(birthDate)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);

  // 4月1日生まれまでは前年度生まれ（いわゆる早生まれ）と同じ学年になる
  const birthFiscalYear = bm < 4 || (bm === 4 && bd === 1) ? by - 1 : by;
  // 今日が属する年度（4月1日始まり）
  const schoolYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  // 小学1年生 = 1、中学1年生 = 7、高校1年生 = 10
  const n = schoolYear - birthFiscalYear - 6;

  if (schoolYear < birthFiscalYear) return null;
  if (n <= 0) return { stage: "preschool", year: 0, label: "未就学" };
  if (n <= 6) return { stage: "elementary", year: n, label: `小学${n}年` };
  if (n <= 9) return { stage: "juniorHigh", year: n - 6, label: `中学${n - 6}年` };
  if (n <= 12) return { stage: "highSchool", year: n - 9, label: `高校${n - 9}年` };
  return { stage: "graduated", year: 0, label: "高校卒業後" };
}

/** 2つの "YYYY-MM-DD" の日数差（to - from）。どちらかが不正なら null */
export function daysBetween(from: string, to: string): number | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
