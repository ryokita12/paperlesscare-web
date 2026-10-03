"use client";

// LINEスタッフ版「今日の利用」（Phase 2）。現場で一番よく使う画面。
// 今日の利用予定者ごとに、予定時間・今の状態と、次にする操作（来所／欠席／退所）を大きなボタンで出す。
//   - 来所：押した時刻（日本時間・1分単位）を来所時刻として記録
//   - 退所：押した時刻を退所時刻として記録
//   - 欠席：理由は任意（空のままでもよい）
//   - 予定のキャンセル・各操作の取り消しは、小さな文字のボタンで出す（押し間違いを直せるように）
//   - 予定にない子が来た：利用者を選ぶと、今の時刻で来所を記録（予定外の来所）
// 記録は今日の usageRecords を購読しているので、管理Webや他のスタッフの記録もすぐ反映される。
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
import {
  compareByPlannedStart,
  displayStatusOf,
  formatDateWithWeekday,
  type UsageRecord,
} from "@/lib/usage/model";
import { canApplyUsageAction, UsageTransitionError, type UsageAction } from "@/lib/usage/transitions";
import { countUsage } from "@/lib/usage/summary";
import { formatTimeRange } from "@/lib/usage/time";
import {
  applyUsageRecordAction,
  listUsageBeneficiaries,
  subscribeUsageRecordsByDate,
  type UsageBeneficiary,
} from "@/lib/usage/usageStore";
import { useLineStaff } from "../LineSessionProvider";
import BeneficiaryPicker from "../beneficiaries/BeneficiaryPicker";
import {
  friendlyErrorMessage,
  IconUserPlus,
  LineButton,
  LineCard,
  LineCenteredMessage,
  LineNotice,
  LinePageHeader,
  LineSpinner,
} from "../ui";

function messageOf(e: unknown): string {
  if (e instanceof UsageTransitionError) return e.message;
  return friendlyErrorMessage(e);
}

type Group = { key: string; title: string; records: UsageRecord[] };

export default function LineTodayPage() {
  const { tenantId } = useLineStaff();
  const [today] = useState(() => toJapanIsoDate(new Date()));
  const [records, setRecords] = useState<UsageRecord[] | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<UsageBeneficiary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [absentFor, setAbsentFor] = useState<string | null>(null);
  const [absentReason, setAbsentReason] = useState("");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listUsageBeneficiaries(tenantId)
      .then((list) => !cancelled && setBeneficiaries(list))
      .catch((e) => !cancelled && setLoadError(friendlyErrorMessage(e, "通信状況を確認して、もう一度お試しください。")));
    const unsubscribe = subscribeUsageRecordsByDate(
      tenantId,
      today,
      (list) => {
        if (cancelled) return;
        setRecords(list);
        setLoadError("");
      },
      (e) => !cancelled && setLoadError(friendlyErrorMessage(e, "通信状況を確認して、もう一度お試しください。"))
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tenantId, today, attempt]);

  const byId = useMemo(() => new Map((beneficiaries ?? []).map((b) => [b.id, b])), [beneficiaries]);
  const counts = useMemo(() => countUsage(records ?? [], today), [records, today]);
  const recordedIds = useMemo(() => new Set((records ?? []).map((r) => r.beneficiaryId)), [records]);

  const groups: Group[] = useMemo(() => {
    const sorted = [...(records ?? [])].sort(compareByPlannedStart);
    const of = (pred: (r: UsageRecord) => boolean) => sorted.filter(pred);
    return [
      { key: "waiting", title: "これから来る子", records: of((r) => r.status === "scheduled") },
      { key: "in", title: "来所中", records: of((r) => displayStatusOf(r) === "attended") },
      { key: "done", title: "退所・欠席・キャンセル", records: of((r) => ["departed", "absent", "cancelled"].includes(displayStatusOf(r))) },
    ];
  }, [records]);

  const nameOf = (id: string) => byId.get(id)?.name || "（氏名未登録）";

  const run = async (record: UsageRecord | null, beneficiaryId: string, action: UsageAction, done?: string) => {
    const user = auth.currentUser;
    if (!user) {
      setActionError("ログインの有効期限が切れました。LINEからもう一度開いてください。");
      return;
    }
    setBusyId(record?.id ?? beneficiaryId);
    setActionError("");
    setNotice("");
    try {
      await applyUsageRecordAction({ tenantId, beneficiaryId, date: today, action, user });
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setActionError(messageOf(e));
      return false;
    } finally {
      setBusyId("");
    }
  };

  if (loadError && !records) {
    return (
      <LineCenteredMessage
        tone="error"
        title="今日の利用を読み込めませんでした"
        body={loadError}
        action={{
          label: "もう一度読み込む",
          onClick: () => {
            setLoadError("");
            setRecords(null);
            setAttempt((n) => n + 1);
          },
        }}
      />
    );
  }

  if (picking) {
    return (
      <div className="space-y-5">
        <LinePageHeader
          back={{ onClick: () => setPicking(false), label: "今日の利用" }}
          title="予定にない子が来た"
          subtitle="来所した子を選ぶと、今の時刻で来所を記録します。"
        />
        {actionError && <LineNotice tone="error">{actionError}</LineNotice>}
        <BeneficiaryPicker
          excludeIds={recordedIds}
          disabled={!!busyId}
          onSelect={async (b) => {
            const ok = await run(null, b.id, { type: "walkIn" }, `${nameOf(b.id) || "利用者"}さんの来所を記録しました。`);
            if (ok) setPicking(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LinePageHeader back={{ href: "/line/home", label: "TOP" }} title="今日の利用" subtitle={formatDateWithWeekday(today)} />

      {!records || !beneficiaries ? (
        <LineSpinner fullHeight={false} label="今日の予定を読み込んでいます" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center" data-testid="line-today-summary">
            {[
              { label: "予定", value: counts.planned, tone: "text-zinc-900" },
              { label: "来所", value: counts.attended, tone: "text-emerald-700" },
              { label: "欠席", value: counts.absent, tone: "text-amber-700" },
              { label: "まだ", value: counts.pending, tone: counts.pending > 0 ? "text-sky-700" : "text-zinc-400" },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl bg-white px-1 py-3 shadow-sm ring-1 ring-zinc-200/60">
                <div className={`text-2xl font-bold ${c.tone}`}>{c.value}</div>
                <div className="text-xs text-zinc-500">{c.label}</div>
              </div>
            ))}
          </div>

          {notice && <LineNotice>{notice}</LineNotice>}
          {actionError && <LineNotice tone="error">{actionError}</LineNotice>}

          {records.length === 0 && (
            <LineCard>
              <div className="py-4 text-center text-base leading-relaxed text-zinc-600">
                今日の利用予定はありません。
                <br />
                <span className="text-sm text-zinc-500">予定は管理画面の「利用予定」で作成できます。</span>
              </div>
            </LineCard>
          )}

          {groups.map((g) =>
            g.records.length === 0 ? null : (
              <section key={g.key} className="space-y-3">
                <h2 className="px-1 text-base font-bold text-zinc-700">
                  {g.title}
                  <span className="ml-2 text-sm font-normal text-zinc-500">{g.records.length}人</span>
                </h2>
                {g.records.map((r) => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    name={nameOf(r.beneficiaryId)}
                    grade={byId.get(r.beneficiaryId)?.grade ?? ""}
                    busy={busyId === r.id}
                    absentOpen={absentFor === r.id}
                    absentReason={absentReason}
                    onAbsentReason={setAbsentReason}
                    onOpenAbsent={() => {
                      setAbsentFor(r.id);
                      setAbsentReason("");
                    }}
                    onCloseAbsent={() => setAbsentFor(null)}
                    onAction={async (action, done) => {
                      const ok = await run(r, r.beneficiaryId, action, done);
                      if (ok && action.type === "absent") setAbsentFor(null);
                    }}
                  />
                ))}
              </section>
            )
          )}

          <LineButton variant="secondary" onClick={() => setPicking(true)}>
            <IconUserPlus className="h-6 w-6" />
            予定にない子が来た
          </LineButton>
        </>
      )}
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-sky-50 text-sky-800",
  attended: "bg-emerald-100 text-emerald-800",
  departed: "bg-zinc-100 text-zinc-600",
  absent: "bg-amber-50 text-amber-800",
  cancelled: "bg-zinc-100 text-zinc-400",
};

const STATUS_TEXT: Record<string, string> = {
  scheduled: "まだ来ていません",
  attended: "来所中",
  departed: "退所しました",
  absent: "欠席",
  cancelled: "キャンセル",
};

function SmallTextButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-full px-3 text-sm font-semibold text-zinc-500 underline-offset-2 active:bg-zinc-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RecordCard({
  record,
  name,
  grade,
  busy,
  absentOpen,
  absentReason,
  onAbsentReason,
  onOpenAbsent,
  onCloseAbsent,
  onAction,
}: {
  record: UsageRecord;
  name: string;
  grade: string;
  busy: boolean;
  absentOpen: boolean;
  absentReason: string;
  onAbsentReason: (v: string) => void;
  onOpenAbsent: () => void;
  onCloseAbsent: () => void;
  onAction: (action: UsageAction, done?: string) => void;
}) {
  const status = displayStatusOf(record);
  const planned = record.origin === "walkIn" ? "予定外の来所" : `予定 ${formatTimeRange(record.planned.startTime, record.planned.endTime)}`;

  return (
    <LineCard className={status === "cancelled" ? "opacity-70" : ""}>
      <div className="flex items-start justify-between gap-3" data-testid="line-today-card">
        <div className="min-w-0">
          <div className="truncate text-xl font-bold">
            {name}
            <span className="ml-1 text-base font-normal text-zinc-500">さん</span>
          </div>
          <div className="mt-0.5 text-sm text-zinc-500">
            {grade && <span className="mr-2">{grade}</span>}
            <span className="tabular-nums">{planned}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${STATUS_CHIP[status]}`}>{STATUS_TEXT[status]}</span>
      </div>

      {(record.actual.startTime || record.actual.endTime) && (
        <div className="mt-3 text-base tabular-nums text-zinc-700">
          来所 <b>{record.actual.startTime || "--:--"}</b>
          {record.actual.endTime && (
            <>
              {" "}
              → 退所 <b>{record.actual.endTime}</b>
            </>
          )}
        </div>
      )}
      {status === "absent" && record.absence.reason && <div className="mt-3 text-base text-zinc-700">理由：{record.absence.reason}</div>}

      {status === "scheduled" && !absentOpen && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <LineButton disabled={busy} onClick={() => onAction({ type: "attend" }, `${name}さんの来所を記録しました。`)}>
            来所
          </LineButton>
          <LineButton variant="secondary" disabled={busy} onClick={onOpenAbsent}>
            欠席
          </LineButton>
        </div>
      )}

      {status === "scheduled" && absentOpen && (
        <div className="mt-4 space-y-3 rounded-2xl bg-amber-50/60 p-3">
          <label className="block text-sm font-semibold text-zinc-700" htmlFor={`reason-${record.id}`}>
            欠席の理由（書かなくてもOK）
          </label>
          <input
            id={`reason-${record.id}`}
            className="min-h-12 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-zinc-200 focus:ring-2 focus:ring-emerald-400"
            placeholder="例：体調不良"
            maxLength={200}
            value={absentReason}
            onChange={(e) => onAbsentReason(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <LineButton disabled={busy} onClick={() => onAction({ type: "absent", reason: absentReason }, `${name}さんを欠席にしました。`)}>
              欠席にする
            </LineButton>
            <LineButton variant="ghost" disabled={busy} onClick={onCloseAbsent}>
              やめる
            </LineButton>
          </div>
        </div>
      )}

      {status === "attended" && (
        <div className="mt-4">
          <LineButton disabled={busy} onClick={() => onAction({ type: "depart" }, `${name}さんの退所を記録しました。`)}>
            退所
          </LineButton>
        </div>
      )}

      <div className="mt-2 flex flex-wrap justify-end gap-1">
        {status === "scheduled" && !absentOpen && (
          <SmallTextButton disabled={busy} onClick={() => onAction({ type: "cancel" }, `${name}さんの予定をキャンセルにしました。`)}>
            予定をキャンセルにする
          </SmallTextButton>
        )}
        {canApplyUsageAction(record, "undoAttend") && status === "attended" && (
          <SmallTextButton disabled={busy} onClick={() => onAction({ type: "undoAttend" }, "来所を取り消しました。")}>
            来所を取り消す
          </SmallTextButton>
        )}
        {canApplyUsageAction(record, "undoDepart") && (
          <SmallTextButton disabled={busy} onClick={() => onAction({ type: "undoDepart" }, "退所を取り消しました。")}>
            退所を取り消す
          </SmallTextButton>
        )}
        {status === "absent" && (
          <SmallTextButton disabled={busy} onClick={() => onAction({ type: "attend" }, `${name}さんの来所を記録しました。`)}>
            遅れて来所した
          </SmallTextButton>
        )}
        {canApplyUsageAction(record, "undoAbsent") && (
          <SmallTextButton disabled={busy} onClick={() => onAction({ type: "undoAbsent" }, "欠席を取り消しました。")}>
            欠席を取り消す
          </SmallTextButton>
        )}
        {canApplyUsageAction(record, "restore") && (
          <SmallTextButton disabled={busy} onClick={() => onAction({ type: "restore" }, "予定に戻しました。")}>
            予定に戻す
          </SmallTextButton>
        )}
      </div>
    </LineCard>
  );
}
