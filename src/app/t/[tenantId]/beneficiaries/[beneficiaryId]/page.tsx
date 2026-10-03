"use client";

// 利用者カルテ（旧：利用者詳細）。URL は従来どおり /t/{tenantId}/beneficiaries/{beneficiaryId}。
// 受給者証の取込・更新の保存後もこのURLへ戻ってくる（CertImportFlow は変更していない）。
// タブは ?tab=basic|certificates|contract|documents|history で指定でき、省略時は「基本情報」。
// Phase 1-C：上部に「要対応」（受給者証の期限・必要書類の未提出・カルテ反映候補の未確認）を表示し、
// 各項目から該当するタブ・箇所へ移動できる（?focus=chartReview|{書類の種別} で移動先の箇所を指定）。
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import {
  getBeneficiaryChart,
  getCurrentCertificateValidity,
  getDocumentSubmissions,
  type BeneficiaryChart,
  type CurrentCertificateValidity,
} from "@/lib/beneficiaryChart/chartStore";
import { getCertificateStatus } from "@/lib/beneficiaryChart/certificateStatus";
import { toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
import { computeActionItems, type ActionItemTarget } from "@/lib/beneficiaryChart/actionItems";
import type { DocumentSubmissionInput } from "@/lib/beneficiaryChart/documents";
import { resolveChartIdentity, USAGE_STATUS_OPTIONS } from "@/lib/beneficiaryChart/model";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import ChartHeader from "./chart/ChartHeader";
import ChartTabs, { isChartTabId, type ChartTabId } from "./chart/ChartTabs";
import BasicInfoTab from "./chart/BasicInfoTab";
import ContractTab from "./chart/ContractTab";
import DocumentsTab from "./chart/DocumentsTab";
import CertificatesPanel from "./chart/CertificatesPanel";
import ActionItemsPanel from "./chart/ActionItemsPanel";
import ChartHistoryTab from "./chart/ChartHistoryTab";
import { secondaryButtonClass } from "../components/chartUi";

const LEAVE_CONFIRM = "保存していない入力があります。入力内容を破棄して移動しますか？";

// 要対応から移動したときの、タブ内の移動先（key は移動のたびに変わる値。同じ箇所へ再度移動してもスクロールする）
type FocusRequest = { focus: string; key: number } | null;

function BeneficiaryChartPage() {
  const params = useParams<{ tenantId: string; beneficiaryId: string }>();
  const tenantId = params?.tenantId ?? "";
  const beneficiaryId = params?.beneficiaryId ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useRequireAuth();

  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<ChartTabId>(isChartTabId(tabParam) ? tabParam : "basic");
  const [chart, setChart] = useState<BeneficiaryChart | null>(null);
  const [currentCertificate, setCurrentCertificate] = useState<CurrentCertificateValidity | null>(null);
  const [documentSubmissions, setDocumentSubmissions] = useState<DocumentSubmissionInput[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [today] = useState(() => new Date());
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(() => {
    const focus = searchParams.get("focus");
    return focus && isChartTabId(tabParam) ? { focus, key: 1 } : null;
  });

  // 編集中のカード（同時に1つだけ）と、受給者証タブの未保存の修正
  const [editingId, setEditingId] = useState<string | null>(null);
  const [certificateDirty, setCertificateDirty] = useState(false);
  const hasUnsavedChanges = editingId !== null || certificateDirty;

  const reload = useCallback(async () => {
    const next = await getBeneficiaryChart(tenantId, beneficiaryId);
    if (!next) {
      setState("notFound");
      return;
    }
    const [cert, documents] = await Promise.all([
      getCurrentCertificateValidity(tenantId, next.record, next.sections),
      getDocumentSubmissions(tenantId, beneficiaryId),
    ]);
    setChart(next);
    setCurrentCertificate(cert);
    setDocumentSubmissions(documents);
    setState("ready");
  }, [tenantId, beneficiaryId]);

  useEffect(() => {
    if (loading || !user || !tenantId || !beneficiaryId) return;
    void Promise.resolve()
      .then(reload)
      .catch((e: unknown) => {
        setLoadError(friendlyChartError(e, "load"));
        setState("error");
      });
  }, [loading, user, tenantId, beneficiaryId, reload]);

  // 保存後の再読み込み。失敗しても保存自体は成功しているため、例外は外へ出さない
  const refreshAfterSave = useCallback(async () => {
    try {
      await reload();
    } catch {
      // 表示が古いままになるだけ。次の操作・再読み込みで最新になる
    }
  }, [reload]);

  const confirmLeave = () => !hasUnsavedChanges || window.confirm(LEAVE_CONFIRM);

  const changeTab = (tab: ChartTabId, focus?: string) => {
    if (tab !== activeTab) {
      if (!confirmLeave()) return;
      setEditingId(null);
      setCertificateDirty(false);
      setActiveTab(tab);
    } else if (!focus) {
      return;
    }
    setFocusRequest(focus ? { focus, key: Date.now() } : null);
    const qs = new URLSearchParams(searchParams.toString());
    if (tab === "basic") qs.delete("tab");
    else qs.set("tab", tab);
    if (focus) qs.set("focus", focus);
    else qs.delete("focus");
    const query = qs.toString();
    router.replace(`/t/${tenantId}/beneficiaries/${beneficiaryId}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const goToActionTarget = (target: ActionItemTarget) => changeTab(target.tab, target.focus);

  const goBack = () => {
    if (!confirmLeave()) return;
    router.push(`/t/${tenantId}/beneficiaries`);
  };

  // 既存の取込・更新フローへ（利用者詳細の「受給者証を更新／登録」と同じURL）
  const goRegisterCertificate = () => {
    if (!confirmLeave()) return;
    router.push(`/t/${tenantId}?beneficiaryId=${encodeURIComponent(beneficiaryId)}&new=1`);
  };

  const identity = useMemo(
    () => (chart ? resolveChartIdentity(chart.record, chart.sections, today) : null),
    [chart, today]
  );
  const certificateStatus = useMemo(
    () =>
      getCertificateStatus({
        hasCertificate: !!currentCertificate,
        validTo: currentCertificate?.validTo,
        today: toJapanIsoDate(today),
      }),
    [currentCertificate, today]
  );
  const actionItems = useMemo(
    () =>
      chart
        ? computeActionItems({
            today: toJapanIsoDate(today),
            usageStatus: chart.sections.personal.usageStatus,
            certificate: currentCertificate,
            documents: documentSubmissions,
            chartReview: currentCertificate
              ? { certificateId: currentCertificate.certificateId, pendingCount: currentCertificate.pendingReviewCount }
              : null,
          })
        : [],
    [chart, currentCertificate, documentSubmissions, today]
  );

  if (loading || (user && state === "loading")) {
    return <div className="text-sm">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-sm">ログインしてください</div>
        <button
          className="mt-4 w-full rounded-xl border px-3 py-2 text-sm"
          onClick={() =>
            router.push(`/login?next=${encodeURIComponent(`/t/${tenantId}/beneficiaries/${beneficiaryId}`)}`)
          }
        >
          Login
        </button>
      </div>
    );
  }

  if (state !== "ready" || !chart || !identity) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm" role="alert">
          {state === "notFound"
            ? "この利用者は見つかりませんでした。削除されたか、URLが正しくない可能性があります。利用者一覧から選び直してください。"
            : loadError || "利用者の情報を読み込めませんでした。"}
        </div>
        <button type="button" onClick={() => router.push(`/t/${tenantId}/beneficiaries`)} className={secondaryButtonClass}>
          利用者一覧に戻る
        </button>
      </div>
    );
  }

  const usageLabel = USAGE_STATUS_OPTIONS.find((o) => o.id === chart.sections.personal.usageStatus)?.label ?? "";
  const tabProps = {
    tenantId,
    chart,
    identity,
    today,
    user,
    control: { editingId, setEditingId },
    onSaved: refreshAfterSave,
  };

  return (
    <div className="space-y-4 overflow-x-hidden">
      <ChartHeader
        identity={identity}
        usageLabel={usageLabel}
        certificateStatus={certificateStatus}
        currentCertificate={currentCertificate}
        onBack={goBack}
        onRegisterCertificate={goRegisterCertificate}
      />

      <ActionItemsPanel
        items={actionItems}
        documentsUnavailable={documentSubmissions === null && chart.sections.personal.usageStatus !== "ended"}
        onNavigate={goToActionTarget}
      />

      <ChartTabs active={activeTab} onChange={(tab) => changeTab(tab)} />

      <div role="tabpanel">
        {activeTab === "basic" && <BasicInfoTab {...tabProps} />}
        {activeTab === "certificates" && (
          <CertificatesPanel
            tenantId={tenantId}
            beneficiaryId={beneficiaryId}
            onDirtyChange={setCertificateDirty}
            onSaved={() => void refreshAfterSave()}
            reviewFocusKey={focusRequest?.focus === "chartReview" ? focusRequest.key : undefined}
            onReviewRecorded={() => void refreshAfterSave()}
          />
        )}
        {activeTab === "contract" && <ContractTab {...tabProps} />}
        {activeTab === "documents" && (
          <DocumentsTab
            tenantId={tenantId}
            beneficiaryId={beneficiaryId}
            user={user}
            certificateCount={chart.record.certificateCount}
            certificateStatus={certificateStatus}
            onShowCertificates={() => changeTab("certificates")}
            focusType={focusRequest?.focus}
            focusKey={focusRequest?.key}
            onChanged={() => void refreshAfterSave()}
          />
        )}
        {activeTab === "history" && (
          <ChartHistoryTab
            tenantId={tenantId}
            beneficiaryId={beneficiaryId}
            onShowCertificates={() => changeTab("certificates")}
          />
        )}
      </div>
    </div>
  );
}

export default function BeneficiaryChartRoute() {
  return (
    <Suspense fallback={<div className="text-sm">Loading...</div>}>
      <BeneficiaryChartPage />
    </Suspense>
  );
}
