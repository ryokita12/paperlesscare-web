// 利用者ごとの「要対応」（Phase 1-C）。Firebase非依存の純粋ロジック。
//
// 要対応は Firestore に保存せず、既存のデータから毎回求める（派生データ）：
//   - 受給者証の期限        … 現在の受給者証の validTo（旧データは利用者doc直下から求めた値）と今日の日付
//   - 必要書類の未提出      … documents サブコレクションの提出状態
//   - カルテ反映候補の未確認 … 現在の通所受給者証と現在のカルテ・chartReview（Phase 1-B7 の候補をそのまま数える）
// 期限は日付が進むだけで変わり、書類・反映候補は複数の画面（管理Web・LINE の取込を含む）から変わるため、
// 保存すると同期漏れで古い値が残る。そのため保存しない。
//
// 画面は ActionItem の type / severity / message / target だけを見て表示・移動する（個別の判定を画面に持たない）。
import { getCertificateStatus } from "./certificateStatus.ts";
import { formatJapaneseDate } from "./dates.ts";
import {
  summarizeRequiredDocuments,
  type BeneficiaryDocumentType,
  type DocumentSubmissionInput,
} from "./documents.ts";

export type ActionItemType =
  | "certificateExpired"
  | "certificateExpiringSoon"
  | "certificateExpiryUnknown"
  | "certificateMissing"
  | "documentMissing"
  | "chartReviewPending";

/** urgent：すぐ対応（🔴）、warning：対応が必要（🟠）、review：確認が必要（🔵） */
export type ActionItemSeverity = "urgent" | "warning" | "review";

export const ACTION_SEVERITY_META: Readonly<
  Record<ActionItemSeverity, { icon: string; label: string; order: number }>
> = {
  urgent: { icon: "🔴", label: "至急", order: 0 },
  warning: { icon: "🟠", label: "要対応", order: 1 },
  review: { icon: "🔵", label: "要確認", order: 2 },
};

/** 移動先（カルテのタブと、タブ内の該当箇所） */
export type ActionItemTarget =
  | { tab: "certificates"; focus?: "chartReview" }
  | { tab: "documents"; focus?: BeneficiaryDocumentType };

export type ActionItem = {
  /** 同じ利用者の中で一意・安定（画面の key、テスト用） */
  id: string;
  type: ActionItemType;
  severity: ActionItemSeverity;
  message: string;
  /** 補足（期限の日付・件数など）。無ければ "" */
  detail: string;
  /** 移動ボタンの文言 */
  actionLabel: string;
  target: ActionItemTarget;
};

export type ActionItemsInput = {
  /** 日本時間の今日 "YYYY-MM-DD" */
  today: string;
  /** personal.usageStatus。"ended"（利用終了）の利用者は要対応を出さない */
  usageStatus: string;
  /** 現在の受給者証。未登録なら null */
  certificate: { validTo: string | null } | null;
  /** 書類の提出状態。読み込めなかった場合は null（書類の要対応は出さない） */
  documents: readonly DocumentSubmissionInput[] | null;
  /** 現在の通所受給者証のカルテ反映候補（未確認）の件数と証ID。無ければ null */
  chartReview: { certificateId: string; pendingCount: number } | null;
};

function certificateItems(input: ActionItemsInput): ActionItem[] {
  const status = getCertificateStatus({
    hasCertificate: !!input.certificate,
    validTo: input.certificate?.validTo,
    today: input.today,
  });
  const validTo = formatJapaneseDate(input.certificate?.validTo ?? "");
  const target: ActionItemTarget = { tab: "certificates" };

  switch (status.kind) {
    case "expired":
      return [
        {
          id: "certificate:expired",
          type: "certificateExpired",
          severity: "urgent",
          message: "受給者証の期限が切れています",
          detail: `有効期限：${validTo}（${Math.abs(status.daysLeft ?? 0)}日経過）`,
          actionLabel: "受給者証を確認",
          target,
        },
      ];
    case "expiringSoon":
      return [
        {
          id: "certificate:expiringSoon",
          type: "certificateExpiringSoon",
          severity: "warning",
          message: "受給者証の期限が30日以内です",
          detail: `有効期限：${validTo}（${status.daysLeft === 0 ? "本日まで" : `あと${status.daysLeft}日`}）`,
          actionLabel: "受給者証を確認",
          target,
        },
      ];
    case "unknownExpiry":
      return [
        {
          id: "certificate:expiryUnknown",
          type: "certificateExpiryUnknown",
          severity: "warning",
          message: "受給者証の有効期限が未入力です",
          detail: "期限切れを知らせるために、受給者証タブで有効期間を確認・入力してください",
          actionLabel: "受給者証を確認",
          target,
        },
      ];
    case "none":
      return [
        {
          id: "certificate:missing",
          type: "certificateMissing",
          severity: "warning",
          message: "受給者証が登録されていません",
          detail: "",
          actionLabel: "受給者証タブへ",
          target,
        },
      ];
    default:
      return [];
  }
}

function documentItems(input: ActionItemsInput): ActionItem[] {
  if (!input.documents) return [];
  return summarizeRequiredDocuments(input.documents)
    .filter((d) => !d.submitted)
    .map((d) => ({
      id: `document:${d.type}`,
      type: "documentMissing" as const,
      severity: "warning" as const,
      message: `${d.label}が未提出です`,
      detail: "",
      actionLabel: "書類を確認",
      target: { tab: "documents" as const, focus: d.type },
    }));
}

function chartReviewItems(input: ActionItemsInput): ActionItem[] {
  const review = input.chartReview;
  if (!review || review.pendingCount <= 0) return [];
  return [
    {
      id: `chartReview:${review.certificateId}`,
      type: "chartReviewPending",
      severity: "review",
      message: "受給者証からのカルテ反映候補があります",
      detail: `未確認の項目が${review.pendingCount}件あります`,
      actionLabel: "反映候補を確認",
      target: { tab: "certificates", focus: "chartReview" },
    },
  ];
}

/**
 * 利用者の要対応の一覧（重要度の高い順）。件数は返り値の length。
 * 利用終了の利用者は対応不要のため常に 0 件。
 */
export function computeActionItems(input: ActionItemsInput): ActionItem[] {
  if (input.usageStatus === "ended") return [];
  const items = [...certificateItems(input), ...documentItems(input), ...chartReviewItems(input)];
  // 同じ重要度の中では上の並び（受給者証 → 書類 → 反映候補）を保つ
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        ACTION_SEVERITY_META[a.item.severity].order - ACTION_SEVERITY_META[b.item.severity].order ||
        a.index - b.index
    )
    .map(({ item }) => item);
}

/** URL の ?tab=...&focus=... */
export function actionTargetQuery(target: ActionItemTarget): string {
  const qs = new URLSearchParams({ tab: target.tab });
  if (target.focus) qs.set("focus", target.focus);
  return qs.toString();
}
