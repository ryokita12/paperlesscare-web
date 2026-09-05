import type { CertTypeId } from "./certPages";

// 受給者証種別 × ページ番号 → 帳票レイアウトの対応表。
//
// レイアウトの実体（Reactコンポーネント）は components/certLayouts.tsx にあるが、
// 「どの種別のどのページがどのレイアウトを使うか」というルールだけをここに切り出し、
// JSXを含まない純粋なデータとして単体テストできるようにしている。
//
// public/cert-samples/ の adult / child（page1〜7）を比較した結果、
// 構造が異なるのは page6 だけで、child にのみ「問い合わせ先」欄がある。
// それ以外のページは色以外の差がないため、同じレイアウトを共有する。
//
// mobility（移動支援）はサンプルが仮素材で様式を確認できていないため、
// 暫定的に adult と同じ対応を維持する（今回は変更しない）。

export type CertLayoutId =
  | "certificate1" // 障害福祉サービス受給者証（Ⅰ）
  | "careBenefit1" // 介護給付費の支給決定内容①
  | "careBenefit2" // 介護給付費の支給決定内容②
  | "trainingBenefit" // 訓練等給付費の支給決定内容
  | "certificate2" // 障害福祉サービス受給者証（Ⅱ）
  | "planSupport" // 計画相談支援給付費の支給内容（問い合わせ先なし・adult）
  | "planSupportWithContact" // 同上（問い合わせ先あり・child）
  | "userBurden"; // 利用者負担に関する事項

// ページ7・8はいずれも「利用者負担に関する事項」で同一レイアウトを使う。
const ADULT_LAYOUT_IDS: readonly CertLayoutId[] = [
  "certificate1",
  "careBenefit1",
  "careBenefit2",
  "trainingBenefit",
  "certificate2",
  "planSupport",
  "userBurden",
  "userBurden",
];

// child は page6（index 5）だけ adult と異なり、
// それ以外のページは adult とまったく同じレイアウトIDを参照する。
//
// index 7（page8）について:
//   page8 のサンプル画像は page1 の複製で、正式な様式が確認できていない。
//   今回 page8 のレイアウトを新規に実装・決定することはせず、
//   adult の既存の割り当て（"userBurden"）をそのまま踏襲している。
//   様式が判明した時点で adult / child 双方をあらためて見直す。
const CHILD_LAYOUT_IDS: readonly CertLayoutId[] = [
  "certificate1",
  "careBenefit1",
  "careBenefit2",
  "trainingBenefit",
  "certificate2",
  "planSupportWithContact", // ← page6：child のみ問い合わせ先あり
  "userBurden",
  "userBurden",
];

const CERT_LAYOUT_IDS: Record<CertTypeId, readonly CertLayoutId[]> = {
  mobility: ADULT_LAYOUT_IDS,
  adult: ADULT_LAYOUT_IDS,
  child: CHILD_LAYOUT_IDS,
};

// 帳票上「問い合わせ先」欄を持つレイアウト。
// 様式画像で印字を確認できたものだけを列挙している。
//   trainingBenefit（page4）        : adult / child とも問い合わせ先あり
//   userBurden（page7）             : adult / child とも問い合わせ先あり
//   planSupportWithContact（page6） : child のみ問い合わせ先あり
//   planSupport（page6・adult）     : 問い合わせ先なし（列挙しない）
const CONTACT_INFO_LAYOUT_IDS: ReadonlySet<CertLayoutId> = new Set([
  "trainingBenefit",
  "planSupportWithContact",
  "userBurden",
]);

/**
 * そのレイアウトが帳票上「問い合わせ先」欄を持つかどうか。
 * レイアウト実装（components/certLayouts.tsx）もこの判定を参照するため、
 * 様式差の定義がこの1箇所に集約される。
 */
export function hasContactInfoRow(layoutId: CertLayoutId): boolean {
  return CONTACT_INFO_LAYOUT_IDS.has(layoutId);
}

const FALLBACK_LAYOUT_ID: CertLayoutId =
  ADULT_LAYOUT_IDS[ADULT_LAYOUT_IDS.length - 1];

/**
 * 受給者証種別とページ番号（0始まり）から、使用する帳票レイアウトのIDを返す。
 * 未知の種別・範囲外のページは adult の定義へフォールバックする。
 */
export function getCertLayoutId(
  certType: CertTypeId,
  pageIndex: number
): CertLayoutId {
  const layoutIds = CERT_LAYOUT_IDS[certType] ?? ADULT_LAYOUT_IDS;
  return layoutIds[pageIndex] ?? FALLBACK_LAYOUT_ID;
}
