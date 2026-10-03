// 通所受給者証 parser の入口（Phase 1-B2）。
//
// 【未接続】ここは parseCertText.ts の CERT_PAGE_PARSERS にはまだ登録していない。
// 現在の PaperlessCare 本体からは呼ばれない。登録は Phase 1-B3 で行う。
//
// TSUSHO_PAGE_PARSERS のキーは既存の CERT_PAGE_PARSERS と同じ「ページ番号（0始まり）」。
// 六・七面（index 5・6、事業者記入欄）は OCR 対象外のため parser を置かない。
import { normalizeText } from "../../../app/t/[tenantId]/lib/parsers/normalizeText.ts";
import type { FormDataType } from "../../../app/t/[tenantId]/types/cert";
import { parseTsushoFace1 } from "./face1.ts";
import { parseTsushoFace2, parseTsushoFace3 } from "./decisionFaces.ts";
import { parseTsushoFace4 } from "./face4.ts";
import { parseTsushoFace5 } from "./face5.ts";
import { toFormData } from "./helpers.ts";

export type TsushoPageParser = (normalizedText: string) => FormDataType;

export const TSUSHO_PAGE_PARSERS: Readonly<Partial<Record<number, TsushoPageParser>>> = {
  0: parseTsushoFace1,
  1: parseTsushoFace2,
  2: parseTsushoFace3,
  3: parseTsushoFace4,
  4: parseTsushoFace5,
};

/**
 * 既存の parseCertText と同じ手順（normalizeText → ページ別 parser）で通所受給者証を解析する。
 * parser の無いページは空のフォームを返す。
 */
export function parseTsushoCertText(text: string, pageIndex: number): FormDataType {
  const parser = TSUSHO_PAGE_PARSERS[pageIndex];
  if (!parser) return toFormData({});
  return parser(normalizeText(text));
}
