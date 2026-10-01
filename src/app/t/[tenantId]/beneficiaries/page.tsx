"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import { useRequireAuth } from "@/lib/auth";
import {
  createBeneficiaryWithoutCertificate,
  listBeneficiaries,
  type BeneficiaryRecord,
} from "../lib/firestore/beneficiaries";
import { CERT_TYPES } from "../constants/certPages";

function certTypeLabel(certType: string | null) {
  if (!certType) return "受給者証未登録";
  return CERT_TYPES.find((t) => t.id === certType)?.colorName || certType;
}

function formatUpdatedAt(record: BeneficiaryRecord) {
  const ts = record.updatedAt;
  if (!ts) return "未取得";
  try {
    return ts.toDate().toLocaleString("ja-JP");
  } catch {
    return "未取得";
  }
}

export default function BeneficiariesPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? "";
  const router = useRouter();
  const { user, loading } = useRequireAuth();

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  // 管理Webから受給者証なしで利用者（枠）だけを作成するフォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFurigana, setNewFurigana] = useState("");
  const [newBirthday, setNewBirthday] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleCreate = async () => {
    if (!user || creating || !newName.trim()) return;

    setCreating(true);
    setCreateError("");
    try {
      const id = await createBeneficiaryWithoutCertificate({
        tenantId,
        profile: {
          name: newName.trim(),
          furigana: newFurigana.trim(),
          birthday: newBirthday.trim(),
        },
        user,
      });
      router.push(`/t/${tenantId}/beneficiaries/${id}`);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "利用者の作成に失敗しました");
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!user || !tenantId) return;

    let cancelled = false;
    setFetching(true);
    setError("");

    listBeneficiaries(tenantId)
      .then((records) => {
        if (!cancelled) setBeneficiaries(records);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || "受給者一覧の取得に失敗しました");
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, tenantId]);

  if (loading || fetching) {
    return (
      <div className={styles.page}>
        <div className="text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>受給者管理</h1>
          <p className={styles.desc}>
            受給者の登録・検索・一覧確認を行うための管理画面です。
          </p>
        </div>

        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
        >
          ＋ 受給者を新規登録
        </button>
      </div>

      {showCreateForm && (
        <div className={styles.searchCard}>
          <div className={styles.cardTitle}>受給者を新規登録（受給者証なし）</div>
          <p className={styles.desc}>
            氏名などの基本情報だけで利用者を作成します。受給者証は作成後の詳細画面から登録できます。
          </p>

          <div className={styles.searchGrid}>
            <div className={styles.field}>
              <label className={styles.label}>氏名（必須）</label>
              <input
                className={styles.input}
                type="text"
                placeholder="山田 太郎"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>フリガナ</label>
              <input
                className={styles.input}
                type="text"
                placeholder="ヤマダ タロウ"
                value={newFurigana}
                onChange={(e) => setNewFurigana(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>生年月日</label>
              <input
                className={styles.input}
                type="text"
                placeholder="平成20年4月1日"
                value={newBirthday}
                onChange={(e) => setNewBirthday(e.target.value)}
              />
            </div>
          </div>

          {createError && <div className="mt-3 text-sm text-red-600">⚠️ {createError}</div>}

          <div className={styles.searchActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setShowCreateForm(false)}
              disabled={creating}
            >
              キャンセル
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? "作成中..." : "作成する"}
            </button>
          </div>
        </div>
      )}

      {/* 検索は未実装のため、スマホ幅では一覧が画面外に押し出されないよう非表示にする */}
      <div className={`${styles.searchCard} ${styles.hideOnMobile}`}>
        <div className={styles.cardTitle}>検索条件</div>

        <div className={styles.searchGrid}>
          <div className={styles.field}>
            <label className={styles.label}>受給者名</label>
            <input className={styles.input} type="text" placeholder="山田 太郎" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>受給者番号</label>
            <input className={styles.input} type="text" placeholder="1234567890" />
          </div>

          <div className={`${styles.field} ${styles.selectField}`}>
						<label className={styles.label}>自治体</label>
						<select className={styles.select} defaultValue="">
              <option value="">選択してください</option>
              <option value="名古屋市">名古屋市</option>
              <option value="春日井市">春日井市</option>
              <option value="小牧市">小牧市</option>
            </select>
          </div>

          <div className={`${styles.field} ${styles.selectField}`}>
						<label className={styles.label}>利用状況</label>
						<select className={styles.select} defaultValue="">
              <option value="">すべて</option>
              <option value="利用中">利用中</option>
              <option value="停止中">停止中</option>
            </select>
          </div>
        </div>

        <div className={styles.searchActions}>
          <button className={styles.secondaryButton} type="button">
            条件をクリア
          </button>
          <button className={styles.primaryButton} type="button">
            検索
          </button>
        </div>
      </div>

      <div className={styles.listCard}>
        <div className={styles.listHeader}>
          <div className={styles.cardTitle}>受給者一覧</div>
          <div className={styles.count}>{beneficiaries.length}件</div>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600">⚠️ {error}</div>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
								<th className={styles.alignLeft}>受給者名</th>
								<th className={styles.alignCenter}>受給者番号</th>
								<th className={styles.alignCenter}>生年月日</th>
								<th className={styles.alignLeft}>証種別</th>
								<th className={styles.alignCenter}>最終更新日</th>
							</tr>
            </thead>
            <tbody>
							{beneficiaries.map((item) => (
								<tr
									key={item.id}
									className={styles.tableRow}
									onClick={() => router.push(`/t/${tenantId}/beneficiaries/${item.id}`)}
								>
									<td className={styles.alignLeft}>{item.profile.name || item.summary.name || "未登録"}</td>
									<td className={styles.alignCenter}>{item.summary.number || "未取得"}</td>
									<td className={styles.alignCenter}>{item.summary.birthday || "未取得"}</td>
									<td className={styles.alignLeft}>
                    <span className={item.certType ? styles.badgeActive : styles.badgeInactive}>
                      {certTypeLabel(item.certType)}
                    </span>
                  </td>
                  <td className={styles.alignCenter}>{formatUpdatedAt(item)}</td>
                </tr>
              ))}

              {beneficiaries.length === 0 && !error && (
                <tr>
                  <td className={styles.alignCenter} colSpan={5}>
                    まだ登録された受給者がいません。「受給者証取込＆送信」から取り込んでください。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}