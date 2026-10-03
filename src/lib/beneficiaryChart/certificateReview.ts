// 通所受給者証（tsusho）の OCR 結果を、利用者カルテへ「スタッフの確認つきで」反映するための純粋ロジック（Phase 1-B7）。
//
// 原則：OCR の値は事実の「候補」で、personal / guardian / consultationSupport はスタッフが確定したカルテ。
// ここでは候補の表示・反映の内容を組み立てるだけで、Firestore への書き込みは chartStore.ts が行う。
//
// - 候補の対応・状態（same / chartEmpty / different / certEmpty）・初期チェック・18歳以上の同一人物判定は
//   Phase 1-B1 の buildTsushoChartCandidates（src/lib/tsusho/candidates.ts）をそのまま使う（比較を重複実装しない）
// - personal.address の補助候補は作らない（居住地は保護者の欄。B1 の既定どおり）
// - adult / child / mobility の証では候補を作らない
// - スタッフの判断は証doc の chartReview に記録し、同じ証の同じ値の候補は再表示しない（設計書 11.3）
// - 反映は項目単位（フィールドパス）。personal / guardian / consultationSupport のマップ全体を置き換えない
// - personal の氏名・フリガナ・生年月日を反映したときだけ、既存画面向けの profile の同じ項目へ写す
//   （buildPersonalUpdate と同じ規則：生年月日は「2015年5月10日」の形）。summary には触れない
import {
  buildTsushoChartCandidates,
  type TsushoChartSnapshot,
  type TsushoPrimaryCandidateTarget,
} from "../tsusho/candidates.ts";
import {
  normalizeAddressForCompare,
  normalizeDateForCompare,
  normalizeFuriganaForCompare,
  normalizeNameForCompare,
} from "../tsusho/normalize.ts";
import type { TsushoPageLike } from "../tsusho/types.ts";
import { formatJapaneseDate, normalizeDateText } from "./dates.ts";
import type { BeneficiaryChartSections, LegacyIdentity } from "./model.ts";

export type ReviewTarget = TsushoPrimaryCandidateTarget;

type TargetMeta = {
  /** 画面に出す項目名（カルテの既存の項目名に合わせる） */
  label: string;
  /** chartReview.decisions のキー（Firestore のフィールドパスで "." を使わないため） */
  reviewKey: string;
  /** 「同じ値か」を判定する正規化（B1 の比較と同じ関数） */
  compare: (value: string) => string;
  /** 反映時に一緒に写す profile の項目（personal の氏名・フリガナ・生年月日のみ） */
  profileField?: "name" | "furigana" | "birthday";
};

export const REVIEW_TARGETS: Readonly<Record<ReviewTarget, TargetMeta>> = {
  "personal.name": {
    label: "氏名",
    reviewKey: "personal_name",
    compare: normalizeNameForCompare,
    profileField: "name",
  },
  "personal.furigana": {
    label: "フリガナ",
    reviewKey: "personal_furigana",
    compare: normalizeFuriganaForCompare,
    profileField: "furigana",
  },
  "personal.birthDate": {
    label: "生年月日",
    reviewKey: "personal_birthDate",
    compare: (v) => normalizeDateForCompare(v) ?? v,
    profileField: "birthday",
  },
  "guardian.name": { label: "保護者氏名", reviewKey: "guardian_name", compare: normalizeNameForCompare },
  "guardian.furigana": {
    label: "保護者フリガナ",
    reviewKey: "guardian_furigana",
    compare: normalizeFuriganaForCompare,
  },
  "guardian.address": {
    label: "保護者住所",
    reviewKey: "guardian_address",
    compare: normalizeAddressForCompare,
  },
  "consultationSupport.officeName": {
    label: "相談支援事業所",
    reviewKey: "consultationSupport_officeName",
    compare: normalizeNameForCompare,
  },
};

export function reviewTargetLabel(target: ReviewTarget): string {
  return REVIEW_TARGETS[target].label;
}

// ===== 現在のカルテの値 =====

/**
 * 候補の比較に使う「現在のカルテの値」。
 * 本人の氏名・フリガナ・生年月日は、カルテ（personal）が空なら既存の profile（一覧・LINE の表示名）を使う。
 * personal の無い旧データで、表示中の氏名を OCR の値で「未入力 → 初期 ON」として上書きしないため。
 * summary（受給者証の写し）は使わない（いま保存した証そのものなので、比べる意味がない）。
 */
export function chartSnapshotForReview(
  record: Pick<LegacyIdentity, "profile">,
  sections: BeneficiaryChartSections
): TsushoChartSnapshot {
  const { personal, guardian, consultationSupport } = sections;
  const profile = record.profile;
  const profileBirthday = (profile.birthday ?? "").trim();
  return {
    personal: {
      name: personal.name || (profile.name ?? "").trim(),
      furigana: personal.furigana || (profile.furigana ?? "").trim(),
      birthDate: personal.birthDate || normalizeDateText(profileBirthday) || profileBirthday,
      address: personal.address,
    },
    guardian: {
      name: guardian.name,
      furigana: guardian.furigana,
      address: guardian.address,
      sameAddressAsBeneficiary: guardian.sameAddressAsBeneficiary,
    },
    consultationSupport: { officeName: consultationSupport.officeName },
  };
}

// ===== chartReview（証doc に保存する確認記録） =====

export type ReviewAction = "applied" | "dismissed";
export type ReviewCandidateStatus = "chartEmpty" | "different";

/** 1項目の判断の記録（at / by は保存時に chartStore が付ける） */
export type ChartReviewDecision = {
  action: ReviewAction;
  target: ReviewTarget;
  label: string;
  /** 確認時の状態と初期チェック、スタッフが実際にチェックしたか */
  status: ReviewCandidateStatus;
  initiallySelected: boolean;
  selected: boolean;
  /** 受給者証の値（原文）と、カルテへ書き込む（書き込んだ）値 */
  certValue: string;
  proposedValue: string;
  /** 再表示の判定用（proposedValue を項目の比較規則で正規化した値） */
  certValueNormalized: string;
  /** 確認画面に表示した時点のカルテの値 */
  chartValueBefore: string;
  source: { pageNo: number; formKey: string };
};

export type ChartReviewDecisions = Partial<Record<string, ChartReviewDecision>>;

function asMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 証doc の chartReview から、項目ごとの判断を安全に取り出す（形が想定外なら無視する） */
export function readChartReviewDecisions(chartReview: unknown): ChartReviewDecisions {
  const decisions = asMap(asMap(chartReview).decisions);
  const out: ChartReviewDecisions = {};
  for (const [key, raw] of Object.entries(decisions)) {
    const d = asMap(raw);
    if ((d.action === "applied" || d.action === "dismissed") && typeof d.certValueNormalized === "string") {
      out[key] = d as unknown as ChartReviewDecision;
    }
  }
  return out;
}

// ===== 候補の生成 =====

export type CertificateReviewCandidate = {
  target: ReviewTarget;
  reviewKey: string;
  label: string;
  status: ReviewCandidateStatus;
  /** 受給者証の値（原文。表示用） */
  certValue: string;
  /** カルテへ書き込む値（生年月日は ISO） */
  proposedValue: string;
  /** 表示した時点のカルテの値（反映直前の同時編集チェックに使う） */
  chartValue: string;
  /** chartEmpty なら true、different なら false（B1 の initiallySelected） */
  initiallySelected: boolean;
  source: { pageNo: number; formKey: string };
};

export type CertificateReview = {
  candidates: CertificateReviewCandidate[];
  guardianSameAsChild: boolean;
  guardianUsesBeneficiaryAddress: boolean;
};

const EMPTY_REVIEW: CertificateReview = {
  candidates: [],
  guardianSameAsChild: false,
  guardianUsesBeneficiaryAddress: false,
};

export type ReviewInput = {
  certType: string;
  pages: readonly TsushoPageLike[];
  record: Pick<LegacyIdentity, "profile">;
  sections: BeneficiaryChartSections;
};

/** B1 の候補のうち、反映の対象になりうるもの（表示の有無に関係なく全項目）を項目ごとに返す */
function allCandidates(input: ReviewInput) {
  if (input.certType !== "tsusho") return null;
  return buildTsushoChartCandidates(input.pages, chartSnapshotForReview(input.record, input.sections));
}

/**
 * 確認画面に出す候補。
 * - tsusho 以外の証は常に 0 件
 * - same / certEmpty（B1 で visible: false）は出さない
 * - 同じ証で、同じ値についてすでに判断（反映 / 反映しない）した項目は出さない
 */
export function buildCertificateReview(
  input: ReviewInput & { chartReview?: unknown }
): CertificateReview {
  const result = allCandidates(input);
  if (!result) return EMPTY_REVIEW;
  const decisions = readChartReviewDecisions(input.chartReview);

  const candidates: CertificateReviewCandidate[] = [];
  for (const c of result.candidates) {
    if (c.auxiliary || !c.visible || c.proposedValue === null) continue;
    if (c.status !== "chartEmpty" && c.status !== "different") continue;
    const meta = REVIEW_TARGETS[c.target];
    const decided = decisions[meta.reviewKey];
    if (decided && decided.certValueNormalized === meta.compare(c.proposedValue)) continue;
    candidates.push({
      target: c.target,
      reviewKey: meta.reviewKey,
      label: meta.label,
      status: c.status,
      certValue: c.certValue,
      proposedValue: c.proposedValue,
      chartValue: c.chartValue,
      initiallySelected: c.initiallySelected,
      source: c.source,
    });
  }
  return {
    candidates,
    guardianSameAsChild: result.guardianSameAsChild,
    guardianUsesBeneficiaryAddress: result.guardianUsesBeneficiaryAddress,
  };
}

/** 初期のチェック状態（chartEmpty のみ ON） */
export function initialSelection(candidates: readonly CertificateReviewCandidate[]): Set<ReviewTarget> {
  return new Set(candidates.filter((c) => c.initiallySelected).map((c) => c.target));
}

// ===== 反映 / 反映しない =====

export type ReviewPlan = {
  applied: CertificateReviewCandidate[];
  dismissed: CertificateReviewCandidate[];
  /** 確認画面を出したあとにカルテ（または証）が変わっていたため、反映も記録もしなかった項目 */
  stale: CertificateReviewCandidate[];
};

/**
 * 確認画面に表示した候補と、反映直前に読み直した最新の証・カルテから、実際に行う内容を決める。
 * - mode "apply"   … チェックした項目を反映、チェックしなかった項目は「反映しない」として記録
 * - mode "dismiss" … すべて「反映しない」として記録（カルテは変更しない）
 * 表示時からカルテの値・証の値が変わった項目は stale とし、反映も記録もしない（古い画面で上書きしない）。
 */
export function planCertificateReview(params: {
  shown: readonly CertificateReviewCandidate[];
  selected: ReadonlySet<ReviewTarget>;
  mode: "apply" | "dismiss";
  latest: ReviewInput;
}): ReviewPlan {
  const latest = allCandidates(params.latest);
  const latestByTarget = new Map(latest?.candidates.map((c) => [c.target, c]) ?? []);

  const plan: ReviewPlan = { applied: [], dismissed: [], stale: [] };
  for (const shown of params.shown) {
    const now = latestByTarget.get(shown.target);
    const unchanged =
      !!now && now.chartValue === shown.chartValue && now.proposedValue === shown.proposedValue;
    if (!unchanged) plan.stale.push(shown);
    else if (params.mode === "apply" && params.selected.has(shown.target)) plan.applied.push(shown);
    else plan.dismissed.push(shown);
  }
  return plan;
}

/**
 * 利用者doc へ書き込む内容（フィールドパス単位）。反映する項目が無ければ空。
 * updatedAt / updatedBy は chartStore が付ける。
 */
export function buildChartFieldUpdates(
  applied: readonly CertificateReviewCandidate[]
): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const c of applied) {
    updates[c.target] = c.proposedValue;
    const profileField = REVIEW_TARGETS[c.target].profileField;
    if (profileField === "birthday") updates["profile.birthday"] = formatJapaneseDate(c.proposedValue);
    else if (profileField) updates[`profile.${profileField}`] = c.proposedValue;
  }
  return updates;
}

/** 証doc の chartReview.decisions.<key> に書き込む判断の記録（at / by は chartStore が付ける） */
export function buildReviewDecisions(
  plan: ReviewPlan,
  selected: ReadonlySet<ReviewTarget>
): Record<string, ChartReviewDecision> {
  const out: Record<string, ChartReviewDecision> = {};
  const add = (c: CertificateReviewCandidate, action: ReviewAction) => {
    out[c.reviewKey] = {
      action,
      target: c.target,
      label: c.label,
      status: c.status,
      initiallySelected: c.initiallySelected,
      selected: selected.has(c.target),
      certValue: c.certValue,
      proposedValue: c.proposedValue,
      certValueNormalized: REVIEW_TARGETS[c.target].compare(c.proposedValue),
      chartValueBefore: c.chartValue,
      source: c.source,
    };
  };
  for (const c of plan.applied) add(c, "applied");
  for (const c of plan.dismissed) add(c, "dismissed");
  return out;
}
