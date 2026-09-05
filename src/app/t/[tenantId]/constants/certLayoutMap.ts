import type { CertTypeId } from "./certPages";

// 受給者証種別 × ページ番号 → 帳票レイアウトの対応表。
//
// レイアウトの実体（Reactコンポーネント）は components/certLayouts.tsx にあるが、
// 「どの種別のどのページがどのレイアウトを使うか」というルールだけをここに切り出し、
// JSXを含まない純粋なデータとして単体テストできるようにしている。
//
// 現時点では3種別とも同一の様式を参照している。
// public/cert-samples/ の画像を確認した限り、18歳未満（黄緑色）の様式は
// 18歳以上（紫色）と色以外ほぼ同一のため、まずは同じ対応表を共有する。
// 種別ごとに様式が異なるページが判明した時点で、この表のその要素だけを
// 別のIDに差し替えれば、呼び出し側（取込画面・編集画面）は変更不要。

export type CertLayoutId =
  | "certificate1" // 障害福祉サービス受給者証（Ⅰ）
  | "careBenefit1" // 介護給付費の支給決定内容①
  | "careBenefit2" // 介護給付費の支給決定内容②
  | "trainingBenefit" // 訓練等給付費の支給決定内容
  | "certificate2" // 障害福祉サービス受給者証（Ⅱ）
  | "planSupport" // 計画相談支援給付費の支給内容
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

const CERT_LAYOUT_IDS: Record<CertTypeId, readonly CertLayoutId[]> = {
  mobility: ADULT_LAYOUT_IDS,
  adult: ADULT_LAYOUT_IDS,
  child: ADULT_LAYOUT_IDS,
};

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
