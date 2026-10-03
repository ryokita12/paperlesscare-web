// 通所受給者証の給付決定内容（二・三面）を、pages の formData から構造化する純粋関数。
// 結果は保存しない派生データで、必要なたびに pages から作り直す。
import { TSUSHO_SERVICE_ROWS } from "./constants.ts";
import { parseTsushoDayPeriod } from "./period.ts";
import type {
  TsushoPageLike,
  TsushoServiceDecision,
  TsushoServiceKind,
} from "./types.ts";

// CFA要領 Ⅳ-4(2)(ｱ) の4区分。
// 「居宅訪問型児童発達支援」は「児童発達支援」を含むため、長いものから先に判定する。
// 略記（例：「放デイ」）は実物での使用が未確認のため対応しない。
const SERVICE_KIND_LABELS: readonly { kind: Exclude<TsushoServiceKind, "unknown">; label: string }[] = [
  { kind: "kyotakuHoumon", label: "居宅訪問型児童発達支援" },
  { kind: "hoikushoHoumon", label: "保育所等訪問支援" },
  { kind: "houkagoDay", label: "放課後等デイサービス" },
  { kind: "jidoHattatsu", label: "児童発達支援" },
];

function canonicalServiceText(text: string): string {
  return (text ?? "")
    .normalize("NFKC")
    .replace(/\s/g, "")
    // 既存の OCR 前処理は長音「ー」を "-" に置き換えるため、比較用に長音へ戻す
    .replace(/[-‐‑‒–—―−－]/g, "ー");
}

/**
 * 「支援の種類」の記載から区分を判定する。
 * 4区分のうちちょうど1つを含む場合だけその区分を返し、該当なし・複数該当は unknown。
 */
export function normalizeTsushoServiceKind(text: string): TsushoServiceKind {
  let rest = canonicalServiceText(text);
  if (!rest) return "unknown";

  const found = new Set<TsushoServiceKind>();
  for (const { kind, label } of SERVICE_KIND_LABELS) {
    if (rest.includes(label)) {
      found.add(kind);
      // 「居宅訪問型児童発達支援」を判定した後に「児童発達支援」として二重に数えない
      rest = rest.split(label).join("");
    }
  }

  return found.size === 1 ? [...found][0] : "unknown";
}

/**
 * 「支給量等」から1か月あたりの日数を読む。
 * 「23日／月」「23日/月」の形がちょうど1種類だけ見つかる場合のみ数値を返し、
 * 見つからない・複数の異なる値がある・1〜31日の範囲外の場合は null。
 */
export function parseDaysPerMonth(amountText: string): number | null {
  const text = (amountText ?? "").normalize("NFKC");
  const values = new Set<number>();
  for (const m of text.matchAll(/(\d{1,2})\s*日\s*\/\s*月/g)) {
    values.add(Number(m[1]));
  }
  if (values.size !== 1) return null;

  const days = [...values][0];
  return days >= 1 && days <= 31 ? days : null;
}

function pageOf(pages: readonly TsushoPageLike[], pageNo: number): TsushoPageLike | undefined {
  return pages.find((p, i) => (p.pageNo ?? i + 1) === pageNo);
}

function valueOf(page: TsushoPageLike | undefined, key: string): string {
  const v = page?.formData?.[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * pages（二面＝pageNo 2、三面＝pageNo 3）の serviceType1〜4 / serviceAmount1〜4 / servicePeriod1〜4 から、
 * 給付決定内容の一覧を作る。種類・支給量・期間がすべて空の行は含めない。
 */
export function extractTsushoServices(
  pages: readonly TsushoPageLike[]
): TsushoServiceDecision[] {
  const services: TsushoServiceDecision[] = [];

  for (const { row, pageNo, typeKey, amountKey, periodKey } of TSUSHO_SERVICE_ROWS) {
    const page = pageOf(pages, pageNo);
    const kindText = valueOf(page, typeKey);
    const amountText = valueOf(page, amountKey);
    const periodText = valueOf(page, periodKey);
    if (!kindText && !amountText && !periodText) continue;

    services.push({
      row,
      kind: normalizeTsushoServiceKind(kindText),
      kindText,
      amountText,
      daysPerMonth: parseDaysPerMonth(amountText),
      periodText,
      ...parseTsushoDayPeriod(periodText),
    });
  }

  return services;
}
