"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import { useRequireAuth } from "@/lib/auth";
import { listBeneficiaries, type BeneficiaryRecord } from "../lib/firestore/beneficiaries";
import { CERT_TYPES } from "../constants/certPages";

function certTypeLabel(certType: string) {
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
  const { user, loading } = useRequireAuth();

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiaryRecord | null>(null);

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

        <button className={styles.primaryButton} type="button">
          ＋ 受給者を新規登録
        </button>
      </div>

      <div className={styles.searchCard}>
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
									onClick={() => setSelectedBeneficiary(item)}
								>
									<td className={styles.alignLeft}>{item.summary.name || "未登録"}</td>
									<td className={styles.alignCenter}>{item.summary.number || "未取得"}</td>
									<td className={styles.alignCenter}>{item.summary.birthday || "未取得"}</td>
									<td className={styles.alignLeft}>
                    <span className={styles.badgeActive}>{certTypeLabel(item.certType)}</span>
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

      {selectedBeneficiary && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedBeneficiary(null)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>受給者詳細</h2>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setSelectedBeneficiary(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>受給者名</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.summary.name || "未登録"}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>フリガナ</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.summary.furigana || "未取得"}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>生年月日</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.summary.birthday || "未取得"}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>受給者番号</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.summary.number || "未取得"}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>自治体</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.summary.cityName || "未取得"}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>証種別</div>
                  <div className={styles.detailValue}>{certTypeLabel(selectedBeneficiary.certType)}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>最終更新日</div>
                  <div className={styles.detailValue}>{formatUpdatedAt(selectedBeneficiary)}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>作成者</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.createdBy?.email || "不明"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}