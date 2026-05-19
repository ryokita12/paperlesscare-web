"use client";

import { useState } from "react";
import styles from "./page.module.css";

const dummyBeneficiaries = [
  {
    id: "B-0001",
    name: "山田 太郎",
    kana: "ヤマダ タロウ",
    birthDate: "2015-04-12",
    number: "1234567890",
    municipality: "名古屋市",
    status: "利用中",
  },
  {
    id: "B-0002",
    name: "佐藤 花子",
    kana: "サトウ ハナコ",
    birthDate: "2014-09-03",
    number: "2234567890",
    municipality: "春日井市",
    status: "利用中",
  },
  {
    id: "B-0003",
    name: "鈴木 一郎",
    kana: "スズキ イチロウ",
    birthDate: "2016-01-21",
    number: "3234567890",
    municipality: "小牧市",
    status: "停止中",
  },
];

export default function BeneficiariesPage() {
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<(typeof dummyBeneficiaries)[number] | null>(null);

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
          <div className={styles.count}>3件</div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
								<th className={styles.alignCenter}>受給者ID</th>
								<th className={styles.alignLeft}>受給者名</th>
								<th className={styles.alignCenter}>生年月日</th>
								<th className={styles.alignCenter}>受給者番号</th>
								<th className={styles.alignLeft}>自治体</th>
								<th className={styles.alignCenter}>利用状況</th>
							</tr>
            </thead>
            <tbody>
							{dummyBeneficiaries.map((item) => (
								<tr
									key={item.id}
									className={styles.tableRow}
									onClick={() => setSelectedBeneficiary(item)}
								>
                  <td className={styles.alignCenter}>{item.id}</td>
									<td className={styles.alignLeft}>{item.name}</td>
									<td className={styles.alignCenter}>{item.birthDate}</td>
									<td className={styles.alignCenter}>{item.number}</td>
									<td className={styles.alignLeft}>{item.municipality}</td>
									<td className={styles.alignCenter}>
                    <span
                      className={
                        item.status === "利用中" ? styles.badgeActive : styles.badgeInactive
                      }
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
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
                  <div className={styles.detailLabel}>受給者ID</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.id}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>受給者名</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.name}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>生年月日</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.birthDate}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>受給者番号</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.number}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>自治体</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.municipality}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>利用状況</div>
                  <div className={styles.detailValue}>{selectedBeneficiary.status}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}