// 通所受給者証から「新しい利用者」を作るときの、利用者カルテの初期値（純粋関数）。
//
// 既存の利用者には使わない（既存利用者のカルテは OCR で上書きしない。反映は Phase 1-B7 の
// 「候補 → 確認 → 反映」で行う）。新しい利用者にはまだ personal が無いため、取込画面で
// スタッフが確認して保存した受給者証の値から、カルテの初期値だけを作る。
//
//   personal … 児童（一面の name / furigana / birthday）。生年月日は ISO に変換できた場合だけ
//   guardian … 通所給付決定保護者（guardianName / guardianFurigana / guardianAddress）
//               居住地は様式上「保護者の欄」のため guardian.address にだけ入れ、personal.address には入れない
// 作らないもの：
//   - guardianBirthday（カルテに保存先が無い）、郵便番号・電話・続柄（証に無い）
//   - 児童の氏名が読めていない場合の personal（空の personal を作ると、既存の profile / summary への
//     フォールバック表示を妨げるため）
//   - 保護者欄と児童欄が同一人物（18歳以上の通所者）の場合の guardian
import {
  EMPTY_GUARDIAN,
  EMPTY_PERSONAL,
  type BeneficiaryGuardian,
  type BeneficiaryPersonal,
} from "../beneficiaryChart/model.ts";
import { normalizeDateForCompare, normalizeNameForCompare } from "./normalize.ts";
import type { TsushoPageLike } from "./types.ts";

export type TsushoInitialChart = {
  personal?: BeneficiaryPersonal;
  guardian?: BeneficiaryGuardian;
};

function pageOf(pages: readonly TsushoPageLike[], pageNo: number): TsushoPageLike | undefined {
  return pages.find((p, i) => (p.pageNo ?? i + 1) === pageNo);
}

function valueOf(page: TsushoPageLike | undefined, key: string): string {
  const v = page?.formData?.[key];
  return typeof v === "string" ? v.trim() : "";
}

/** 通所受給者証の pages から、新しい利用者のカルテの初期値を作る */
export function buildTsushoInitialChart(pages: readonly TsushoPageLike[]): TsushoInitialChart {
  const face1 = pageOf(pages, 1);

  const name = valueOf(face1, "name");
  const furigana = valueOf(face1, "furigana");
  const birthday = valueOf(face1, "birthday");
  const guardianName = valueOf(face1, "guardianName");
  const guardianFurigana = valueOf(face1, "guardianFurigana");
  const guardianBirthday = valueOf(face1, "guardianBirthday");
  const guardianAddress = valueOf(face1, "guardianAddress");

  const result: TsushoInitialChart = {};

  if (name) {
    result.personal = {
      ...EMPTY_PERSONAL,
      name,
      furigana,
      birthDate: normalizeDateForCompare(birthday) ?? "",
    };
  }

  // 18歳以上の通所者は保護者欄・児童欄の両方に本人が記載される（CFA要領）。同一人物なら保護者を作らない
  const sameAsChild =
    !!name &&
    normalizeNameForCompare(name) === normalizeNameForCompare(guardianName) &&
    normalizeDateForCompare(birthday) === normalizeDateForCompare(guardianBirthday);

  if (!sameAsChild && (guardianName || guardianFurigana || guardianAddress)) {
    result.guardian = {
      ...EMPTY_GUARDIAN,
      name: guardianName,
      furigana: guardianFurigana,
      address: guardianAddress,
    };
  }

  return result;
}

/**
 * 新しい利用者を受給者証から作るときに、利用者docへ追加するカルテの初期値。
 * 通所受給者証（tsusho）だけが対象。それ以外の種別は従来どおり何も追加しない（空オブジェクト）。
 */
export function initialChartForNewBeneficiary(
  certType: string | null | undefined,
  pages: readonly TsushoPageLike[]
): TsushoInitialChart {
  return certType === "tsusho" ? buildTsushoInitialChart(pages) : {};
}
