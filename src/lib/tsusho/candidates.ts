// 通所受給者証の OCR 結果から「利用者カルテへの反映候補」を作る純粋関数。
//
// ここでは候補を作るだけで、Firestore への書き込み・UI は行わない（Phase 1-B1）。
// カルテを直接上書きしてはいけない。反映するかどうかは、将来の UI でスタッフが選ぶ。
//
// 候補の状態：
//   same       … 正規化して比較すると同じ。表示しない
//   chartEmpty … カルテ側が空。表示し、初期 ON
//   different  … 値が異なる。表示し、初期 OFF
//   certEmpty  … 受給者証側が空（または生年月日を日付として読めない）。表示しない
//
// 対応（tsusho のキーの意味は types.ts を参照）：
//   児童       name / furigana / birthday  → personal.name / personal.furigana / personal.birthDate
//   保護者     guardianName / guardianFurigana / guardianAddress → guardian.name / furigana / address
//   相談支援   planOfficeName（四面）      → consultationSupport.officeName
// guardianBirthday はカルテに受け皿が無いため候補にしない。
// 居住地は様式上「通所給付決定保護者」の欄のため guardian.address の候補にする。
// personal.address は通常は候補にしない。includeAuxiliaryPersonalAddress を指定した場合だけ
// 補助候補として作り、その場合も初期 OFF に固定する（型で initiallySelected: false）。
import {
  normalizeAddressForCompare,
  normalizeDateForCompare,
  normalizeFuriganaForCompare,
  normalizeNameForCompare,
} from "./normalize.ts";
import type { TsushoPageLike } from "./types.ts";

export type TsushoCandidateStatus = "same" | "chartEmpty" | "different" | "certEmpty";

export type TsushoPrimaryCandidateTarget =
  | "personal.name"
  | "personal.furigana"
  | "personal.birthDate"
  | "guardian.name"
  | "guardian.furigana"
  | "guardian.address"
  | "consultationSupport.officeName";

type CandidateBase = {
  label: string;
  /** 受給者証のどのページ・キーから来た値か */
  source: { pageNo: number; formKey: string };
  /** 受給者証の値（原文。表示用） */
  certValue: string;
  /** カルテへ書き込むとしたらこの値。生年月日は ISO。反映できない場合は null */
  proposedValue: string | null;
  /** 現在のカルテの値（原文。表示用） */
  chartValue: string;
  status: TsushoCandidateStatus;
  /** 受給者証に値はあるが形式を読めなかった（生年月日を日付として解釈できない等） */
  certUnreadable: boolean;
  /** 将来の UI で表示するか（chartEmpty / different のみ true） */
  visible: boolean;
};

export type TsushoPrimaryCandidate = CandidateBase & {
  target: TsushoPrimaryCandidateTarget;
  auxiliary: false;
  /** 将来の UI での初期チェック状態（chartEmpty のときだけ true） */
  initiallySelected: boolean;
};

/** 補助候補：保護者の居住地を利用者本人の住所として使う場合。常に初期 OFF */
export type TsushoAuxiliaryCandidate = CandidateBase & {
  target: "personal.address";
  auxiliary: true;
  initiallySelected: false;
};

export type TsushoChartCandidate = TsushoPrimaryCandidate | TsushoAuxiliaryCandidate;

/**
 * 比較に使う現在のカルテの値。
 * Phase 1-A の BeneficiaryChartSections（src/lib/beneficiaryChart/model.ts）はこの形を満たす。
 */
export type TsushoChartSnapshot = {
  personal: { name: string; furigana: string; birthDate: string; address: string };
  guardian: { name: string; furigana: string; address: string; sameAddressAsBeneficiary?: boolean };
  consultationSupport: { officeName: string };
};

export type TsushoCandidateOptions = {
  /** personal.address の補助候補を作るか（既定 false。作っても初期 OFF） */
  includeAuxiliaryPersonalAddress?: boolean;
};

export type TsushoCandidateResult = {
  candidates: TsushoChartCandidate[];
  /**
   * 保護者欄と児童欄が同一人物（18歳以上の通所者は両欄に本人を記載する：CFA要領）と判断し、
   * 保護者の候補（guardian.*）を作らなかった場合 true
   */
  guardianSameAsChild: boolean;
  /**
   * カルテで「保護者の住所は利用者と同じ」が指定されている。
   * この場合、guardian.address を反映しても画面上の保護者住所は利用者の住所のまま表示される。
   */
  guardianUsesBeneficiaryAddress: boolean;
};

function pageOf(pages: readonly TsushoPageLike[], pageNo: number): TsushoPageLike | undefined {
  return pages.find((p, i) => (p.pageNo ?? i + 1) === pageNo);
}

function valueOf(page: TsushoPageLike | undefined, key: string): string {
  const v = page?.formData?.[key];
  return typeof v === "string" ? v.trim() : "";
}

type Comparator = (value: string) => string;

function decideStatus(params: {
  certValue: string;
  proposedValue: string | null;
  chartValue: string;
  compare: Comparator;
}): { status: TsushoCandidateStatus; certUnreadable: boolean } {
  const { certValue, proposedValue, chartValue, compare } = params;
  if (!certValue) return { status: "certEmpty", certUnreadable: false };
  if (proposedValue === null) return { status: "certEmpty", certUnreadable: true };
  if (!chartValue.trim()) return { status: "chartEmpty", certUnreadable: false };
  return {
    status: compare(proposedValue) === compare(chartValue) ? "same" : "different",
    certUnreadable: false,
  };
}

function isVisible(status: TsushoCandidateStatus): boolean {
  return status === "chartEmpty" || status === "different";
}

function primary(params: {
  target: TsushoPrimaryCandidateTarget;
  label: string;
  pageNo: number;
  formKey: string;
  certValue: string;
  proposedValue: string | null;
  chartValue: string;
  compare: Comparator;
}): TsushoPrimaryCandidate {
  const { status, certUnreadable } = decideStatus(params);
  return {
    target: params.target,
    label: params.label,
    source: { pageNo: params.pageNo, formKey: params.formKey },
    certValue: params.certValue,
    proposedValue: params.proposedValue,
    chartValue: params.chartValue,
    status,
    certUnreadable,
    visible: isVisible(status),
    auxiliary: false,
    initiallySelected: status === "chartEmpty",
  };
}

/**
 * tsusho 証の pages と現在のカルテの値から、反映候補を作る。
 * same / certEmpty の候補も結果に含める（visible: false）。表示するかは visible で判断する。
 */
export function buildTsushoChartCandidates(
  pages: readonly TsushoPageLike[],
  chart: TsushoChartSnapshot,
  options: TsushoCandidateOptions = {}
): TsushoCandidateResult {
  const face1 = pageOf(pages, 1);
  const face4 = pageOf(pages, 4);

  const childName = valueOf(face1, "name");
  const childFurigana = valueOf(face1, "furigana");
  const childBirthday = valueOf(face1, "birthday");
  const guardianName = valueOf(face1, "guardianName");
  const guardianFurigana = valueOf(face1, "guardianFurigana");
  const guardianBirthday = valueOf(face1, "guardianBirthday");
  const guardianAddress = valueOf(face1, "guardianAddress");
  const planOfficeName = valueOf(face4, "planOfficeName");

  const childBirthIso = childBirthday ? normalizeDateForCompare(childBirthday) : null;
  const guardianBirthIso = guardianBirthday ? normalizeDateForCompare(guardianBirthday) : null;

  // 18歳以上の通所者：保護者欄と児童欄の両方に本人が記載される。
  // 氏名が一致し、生年月日も一致（どちらも読めない場合を含む）すれば同一人物とみなす。
  const guardianSameAsChild =
    !!childName &&
    normalizeNameForCompare(childName) === normalizeNameForCompare(guardianName) &&
    childBirthIso === guardianBirthIso;

  const candidates: TsushoChartCandidate[] = [
    primary({
      target: "personal.name",
      label: "氏名（児童）",
      pageNo: 1,
      formKey: "name",
      certValue: childName,
      proposedValue: childName || null,
      chartValue: chart.personal.name,
      compare: normalizeNameForCompare,
    }),
    primary({
      target: "personal.furigana",
      label: "フリガナ（児童）",
      pageNo: 1,
      formKey: "furigana",
      certValue: childFurigana,
      proposedValue: childFurigana || null,
      chartValue: chart.personal.furigana,
      compare: normalizeFuriganaForCompare,
    }),
    primary({
      target: "personal.birthDate",
      label: "生年月日（児童）",
      pageNo: 1,
      formKey: "birthday",
      certValue: childBirthday,
      proposedValue: childBirthIso,
      // カルテの birthDate は ISO。念のため正規化してから比べる
      chartValue: chart.personal.birthDate,
      compare: (v) => normalizeDateForCompare(v) ?? v,
    }),
  ];

  if (!guardianSameAsChild) {
    candidates.push(
      primary({
        target: "guardian.name",
        label: "氏名（保護者）",
        pageNo: 1,
        formKey: "guardianName",
        certValue: guardianName,
        proposedValue: guardianName || null,
        chartValue: chart.guardian.name,
        compare: normalizeNameForCompare,
      }),
      primary({
        target: "guardian.furigana",
        label: "フリガナ（保護者）",
        pageNo: 1,
        formKey: "guardianFurigana",
        certValue: guardianFurigana,
        proposedValue: guardianFurigana || null,
        chartValue: chart.guardian.furigana,
        compare: normalizeFuriganaForCompare,
      }),
      primary({
        target: "guardian.address",
        label: "住所（保護者・受給者証の居住地）",
        pageNo: 1,
        formKey: "guardianAddress",
        certValue: guardianAddress,
        proposedValue: guardianAddress || null,
        chartValue: chart.guardian.address,
        compare: normalizeAddressForCompare,
      })
    );
  }

  candidates.push(
    primary({
      target: "consultationSupport.officeName",
      label: "相談支援事業所名",
      pageNo: 4,
      formKey: "planOfficeName",
      certValue: planOfficeName,
      proposedValue: planOfficeName || null,
      chartValue: chart.consultationSupport.officeName,
      compare: normalizeNameForCompare,
    })
  );

  if (options.includeAuxiliaryPersonalAddress) {
    const { status, certUnreadable } = decideStatus({
      certValue: guardianAddress,
      proposedValue: guardianAddress || null,
      chartValue: chart.personal.address,
      compare: normalizeAddressForCompare,
    });
    const auxiliary: TsushoAuxiliaryCandidate = {
      target: "personal.address",
      label: "住所（利用者本人）※受給者証の居住地は保護者の欄",
      source: { pageNo: 1, formKey: "guardianAddress" },
      certValue: guardianAddress,
      proposedValue: guardianAddress || null,
      chartValue: chart.personal.address,
      status,
      certUnreadable,
      visible: isVisible(status),
      auxiliary: true,
      initiallySelected: false,
    };
    candidates.push(auxiliary);
  }

  return {
    candidates,
    guardianSameAsChild,
    guardianUsesBeneficiaryAddress: chart.guardian.sameAddressAsBeneficiary === true,
  };
}
