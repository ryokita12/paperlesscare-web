// 受給者証の「要点」（カルテの受給者証タブ上部に表示する項目）を、既存の受給者証docの
// pages[].formData から読み取るだけの純粋ロジック。値の生成・推測はせず、空なら空のまま返す。
//
// 項目がどのページにあるかは既存の帳票レイアウト（components/certLayouts.tsx）に合わせる：
//   ページ1   … 受給者証番号・支給市町村名
//   ページ2〜4 … サービス種別・支給決定期間・支給量（serviceType1〜8 等）
//   ページ7・8 … 利用者負担上限月額・上限額管理（同じレイアウトを共有）

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

function firstValue(pages: PageLike[], pageNos: number[], field: string): string {
  for (const no of pageNos) {
    const v = value(pageOf(pages, no), field);
    if (v) return v;
  }
  return "";
}

export function extractCertificateHighlights(pages: PageLike[]): CertificateHighlights {
  const page1 = pageOf(pages, 1);

  // serviceTypeN 等はページ2〜4に分かれて入っているため、全ページから探す
  const services: CertificateServiceRow[] = [];
  for (const n of SERVICE_SLOTS) {
    const row = {
      type: firstValue(pages, [2, 3, 4], `serviceType${n}`),
      period: firstValue(pages, [2, 3, 4], `servicePeriod${n}`),
      amount: firstValue(pages, [2, 3, 4], `serviceAmount${n}`),
    };
    if (row.type || row.period || row.amount) services.push(row);
  }

  return {
    number: value(page1, "number"),
    cityName: value(page1, "cityName"),
    services,
    burdenLimitAmount: firstValue(pages, [7, 8], "burdenLimitAmount"),
    burdenPeriod: firstValue(pages, [7, 8], "burdenPeriod"),
    managementTargetStatus: firstValue(pages, [7, 8], "managementTargetStatus"),
    managementOfficeName: firstValue(pages, [7, 8], "managementOfficeName"),
  };
}
