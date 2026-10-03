// 受給者証の「要点」（カルテの受給者証タブ上部に表示する項目）を、既存の受給者証docの
// pages[].formData から読み取るだけの純粋ロジック。値の生成・推測はせず、空なら空のまま返す。
//
// 項目がどのページにあるかは既存の帳票レイアウト（components/certLayouts.tsx）に合わせる：
//   ページ1   … 受給者証番号・支給市町村名
//   ページ2〜4 … サービス種別・支給決定期間・支給量（serviceType1〜8 等）
//   ページ7・8 … 利用者負担上限月額・上限額管理（同じレイアウトを共有）
// 通所受給者証（tsusho、7ページ・components/tsushoLayouts.tsx）だけはページ構成が違う：
//   一面 … 受給者証番号・支給市町村名
//   二・三面 … 給付決定内容（serviceType1〜4 等）
//   五面 … 利用者負担上限月額・上限額管理

type PageLike = { pageNo?: number; formData?: Record<string, string | undefined> };

export type CertificateServiceRow = {
  type: string;
  period: string;
  amount: string;
};

export type CertificateHighlights = {
  number: string;
  cityName: string;
  services: CertificateServiceRow[];
  burdenLimitAmount: string;
  burdenPeriod: string;
  managementTargetStatus: string;
  managementOfficeName: string;
};

const SERVICE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function pageOf(pages: PageLike[], pageNo: number): PageLike | undefined {
  return pages.find((p, i) => (p.pageNo ?? i + 1) === pageNo);
}

function value(page: PageLike | undefined, field: string): string {
  const v = page?.formData?.[field];
  return typeof v === "string" ? v.trim() : "";
}

// 種別ごとの「サービス」「利用者負担」が載っているページ（種別が無い・未知の旧データは従来の8ページ様式）
function pageMap(certType: string | null | undefined): { service: number[]; burden: number[] } {
  return certType === "tsusho"
    ? { service: [2, 3], burden: [5] }
    : { service: [2, 3, 4], burden: [7, 8] };
}

function firstValue(pages: PageLike[], pageNos: number[], field: string): string {
  for (const no of pageNos) {
    const v = value(pageOf(pages, no), field);
    if (v) return v;
  }
  return "";
}

export function extractCertificateHighlights(
  pages: PageLike[],
  certType?: string | null
): CertificateHighlights {
  const page1 = pageOf(pages, 1);
  const { service, burden } = pageMap(certType);

  // serviceTypeN 等はページ2〜4に分かれて入っているため、全ページから探す
  const services: CertificateServiceRow[] = [];
  for (const n of SERVICE_SLOTS) {
    const row = {
      type: firstValue(pages, service, `serviceType${n}`),
      period: firstValue(pages, service, `servicePeriod${n}`),
      amount: firstValue(pages, service, `serviceAmount${n}`),
    };
    if (row.type || row.period || row.amount) services.push(row);
  }

  return {
    number: value(page1, "number"),
    cityName: value(page1, "cityName"),
    services,
    burdenLimitAmount: firstValue(pages, burden, "burdenLimitAmount"),
    burdenPeriod: firstValue(pages, burden, "burdenPeriod"),
    managementTargetStatus: firstValue(pages, burden, "managementTargetStatus"),
    managementOfficeName: firstValue(pages, burden, "managementOfficeName"),
  };
}
