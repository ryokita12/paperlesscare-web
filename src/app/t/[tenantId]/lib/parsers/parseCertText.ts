import type { FormDataType } from "../../types/cert";
import { emptyFormData, type CertTypeId } from "../../constants/certPages.ts";
import { normalizeText } from "./normalizeText.ts";
import { parseAdultPage1 } from "./adult/page1.ts";
import { parseAdultPage2 } from "./adult/page2.ts";
import { parseAdultPage3 } from "./adult/page3.ts";
import { parseAdultPage4 } from "./adult/page4.ts";

export type CertPageParser = (text: string) => FormDataType;

// 様式に依存しない緩い抽出。
// ページの意味を考慮せず人物情報（name / birthday / address）を拾おうとするため、
// 非人物ページに適用すると「支給決定期間の一部を生年月日として保存する」ような
// 誤りが起きる。そのため既定では使用せず、
// FALLBACK_ALLOWED_PAGES で明示的に許可した組み合わせでのみ使う。
function parseFallback(text: string): FormDataType {
  return {
    number:
      text.match(/(?:\d\s*){10}/)?.[0]?.replace(/\s/g, "") || "",

    address:
      text.match(/居住地\s*([\s\S]*?)\s*フリガナ/)?.[1]?.trim() ||
      text.match(/住所\s*([\s\S]*?)\s*フリガナ/)?.[1]?.trim() ||
      "",

    furigana: "",

    name:
      text.match(/氏名\s*([^\n]+?)\s*生年月日/)?.[1]?.trim() || "",

    birthday:
      text.match(/(昭和|平成|令和)[^\n]*?日/)?.[0] || "",

    childFurigana: "",

    childName: "",
    childBirthday: "",

    disabilityType: text.match(/障害種別\s*([^\n]+)/)?.[1]?.trim() || "",

    issueDate: text.match(/交付年月日\s*([^\n]+)/)?.[1]?.trim() || "",

    cityName:
      text.match(/支給市町村名\s*([^\n]+)/)?.[1]?.trim() ||
      text.match(/支給市区町村名\s*([^\n]+)/)?.[1]?.trim() ||
      "",

    issuerAddress: "",
  };
}

// 受給者証種別 × ページ番号（0始まり）ごとの専用パーサ。
// 未登録のページは空のフォーム（emptyFormData）を返す。
//
// child（18歳未満）は専用パーサ未実装のため現在は空。
// 実機OCRサンプルを収集したうえで lib/parsers/child/pageN.ts を追加し、
// ここへ登録すれば取込画面・編集画面には手を入れずに有効化できる。
const CERT_PAGE_PARSERS: Record<
  CertTypeId,
  Readonly<Partial<Record<number, CertPageParser>>>
> = {
  adult: {
    0: parseAdultPage1,
    1: parseAdultPage2,
    2: parseAdultPage3,
    3: parseAdultPage4,
  },
  child: {},
  mobility: {},
};

/**
 * 指定された受給者証種別・ページの専用パーサを返す。
 * 専用パーサが存在しない場合は null。
 */
export function getCertPageParser(
  certType: CertTypeId,
  pageIndex: number
): CertPageParser | null {
  return CERT_PAGE_PARSERS[certType]?.[pageIndex] ?? null;
}

// 専用パーサが無いページで parseFallback（様式非依存の緩い抽出）を許可する
// 「受給者証種別 → ページ番号（0始まり）」の許可リスト。
//
// 現在は空＝どの種別・どのページでも許可しない。
// parseFallback はページの意味を区別せず人物情報を拾うため、
// 専用パーサが無い状態で適用すると誤ったデータを保存してしまう。
// 具体的には、ページ2以降に多数ある和暦の「期間」の先頭部分が
// birthday（生年月日）として保存される。
//
// 識別情報ページ（ページ1・5）についても、parseFallback は
// 「支給決定障害者等」と「児童」の2ブロックを区別できないため、
// 本人の欄が空で児童の欄だけ埋まっている場合に児童の氏名・生年月日を
// 本人のフィールドへ入れてしまう。安全性を証明できないため許可しない。
//
// 将来ここへ追加する場合は、そのページのOCR内容と人物フィールドの対応が
// 実サンプルで検証できていることを条件とする。
const FALLBACK_ALLOWED_PAGES: Readonly<
  Partial<Record<CertTypeId, readonly number[]>>
> = {};

/**
 * 指定された受給者証種別・ページで、専用パーサが無いときに
 * parseFallback を使ってよいかどうか。
 */
export function isFallbackAllowed(
  certType: CertTypeId,
  pageIndex: number
): boolean {
  return FALLBACK_ALLOWED_PAGES[certType]?.includes(pageIndex) ?? false;
}

/**
 * OCRテキストを受給者証種別・ページに応じて解析する。
 *
 * 専用パーサがあればそれを使い、無ければ空のフォームを返す。
 * 推測で人物フィールドを埋めないことを優先し、抽出できない項目は
 * 画面上で手入力してもらう方針。
 */
export function parseCertText(
  text: string,
  pageIndex: number,
  certType: CertTypeId
): FormDataType {
  const normalized = normalizeText(text);

  const parser = getCertPageParser(certType, pageIndex);
  if (parser) return parser(normalized);

  if (isFallbackAllowed(certType, pageIndex)) {
    return parseFallback(normalized);
  }

  return emptyFormData();
}
