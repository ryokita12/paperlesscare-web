import type { FormDataType } from "../../types/cert";
import type { CertTypeId } from "../../constants/certPages";
import { normalizeText } from "./normalizeText.ts";
import { parseAdultPage1 } from "./adult/page1.ts";
import { parseAdultPage2 } from "./adult/page2.ts";
import { parseAdultPage3 } from "./adult/page3.ts";
import { parseAdultPage4 } from "./adult/page4.ts";

export type CertPageParser = (text: string) => FormDataType;

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
// 未登録のページは parseFallback（様式非依存の緩い抽出）にフォールバックする。
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

export function parseCertText(
  text: string,
  pageIndex: number,
  certType: CertTypeId
): FormDataType {
  const normalized = normalizeText(text);
  const parser = getCertPageParser(certType, pageIndex);

  return parser ? parser(normalized) : parseFallback(normalized);
}
