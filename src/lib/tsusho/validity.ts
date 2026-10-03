// 通所受給者証の「代表給付決定期間」（一覧の期限管理に使う想定）を決める純粋関数。
//
// 様式9には「証そのものの有効期限」という単一の項目は無い。
// サービスごとの給付決定期間から、次の規則で1つ選ぶ（人間判断済みの仕様）：
//   1. 放課後等デイサービス（houkagoDay）の行が1つでもあれば、放デイの行だけを対象にする
//   2. 対象の中で validTo が最も遅い行を代表にする（追記で新旧の期間が並ぶ場合にも対応）
//   3. 放デイの行が無ければ、全サービスの中で validTo が最も遅い行
//   4. 対象に validTo を読める行が無ければ null
// 放デイの行があるのに期間が読めない場合、他のサービスの期間で代用はしない（null）。
// 根拠の異なる期限を「放デイの期限」と誤って表示しないため。
//
// 「今日」に依存しないため、同じ pages からは常に同じ結果になる。
import { extractTsushoServices } from "./services.ts";
import type {
  TsushoPageLike,
  TsushoRepresentativeValidity,
  TsushoServiceDecision,
} from "./types.ts";

function isLater(a: TsushoServiceDecision & { validTo: string }, b: TsushoServiceDecision & { validTo: string }): boolean {
  if (a.validTo !== b.validTo) return a.validTo > b.validTo;
  // 終了日が同じなら開始日が遅い（＝新しい決定の）行、それも同じなら行番号が小さい行
  const af = a.validFrom ?? "";
  const bf = b.validFrom ?? "";
  if (af !== bf) return af > bf;
  return a.row < b.row;
}

/** サービス一覧から代表給付決定期間を選ぶ */
export function selectRepresentativeService(
  services: readonly TsushoServiceDecision[]
): TsushoRepresentativeValidity | null {
  const hasHoukago = services.some((s) => s.kind === "houkagoDay");
  const pool = hasHoukago ? services.filter((s) => s.kind === "houkagoDay") : services;

  let best: (TsushoServiceDecision & { validTo: string }) | null = null;
  for (const s of pool) {
    if (!s.validTo) continue;
    const candidate = s as TsushoServiceDecision & { validTo: string };
    if (!best || isLater(candidate, best)) best = candidate;
  }
  if (!best) return null;

  return {
    validFrom: best.validFrom,
    validTo: best.validTo,
    row: best.row,
    serviceKind: best.kind,
    serviceKindText: best.kindText,
    periodText: best.periodText,
  };
}

/** pages から代表給付決定期間を求める（Firestore には保存しない） */
export function extractTsushoValidity(
  pages: readonly TsushoPageLike[]
): TsushoRepresentativeValidity | null {
  return selectRepresentativeService(extractTsushoServices(pages));
}
