// カルテの変更履歴（Phase 1-C）の純粋ロジック
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actorDisplayName,
  buildChartHistoryRecord,
  diffFieldUpdates,
  diffPersonalSave,
  diffSectionSave,
  formatChartHistoryTime,
  formatChartHistoryValue,
  readChartHistoryEntry,
} from "./chartHistory.ts";
import { buildChartFieldUpdates, type CertificateReviewCandidate } from "./certificateReview.ts";
import { readChartSections, type BeneficiaryChartSections } from "./model.ts";

function sections(data: Record<string, unknown> = {}): BeneficiaryChartSections {
  return readChartSections(data);
}

const BEFORE = sections({
  personal: { name: "山田 太郎", furigana: "ヤマダ タロウ", birthDate: "2015-05-10", usageStatus: "active" },
  guardian: { name: "山田 花子", relationship: "母", sameAddressAsBeneficiary: false },
  contract: { contractDate: "2025-04-01", contractStatus: "active" },
  school: { schoolName: "〇〇小学校", grade: "" },
  consultationSupport: { officeName: "〇〇相談支援センター" },
});

test("変更履歴：基本情報の保存は変わった項目だけ（前後の値つき）", () => {
  const changes = diffPersonalSave({
    before: BEFORE,
    personal: { ...BEFORE.personal, name: "山田 太朗", phone: " 052-123-4567 " },
    grade: "",
  });
  assert.deepEqual(changes, [
    { path: "personal.name", section: "personal", label: "氏名", before: "山田 太郎", after: "山田 太朗" },
    // 保存時と同じく前後の空白は除いた値で比べる
    { path: "personal.phone", section: "personal", label: "電話番号", before: "", after: "052-123-4567" },
  ]);
});

test("変更履歴：本人情報と一緒に保存する手動の学年も記録する", () => {
  const changes = diffPersonalSave({ before: BEFORE, personal: BEFORE.personal, grade: "小学5年" });
  assert.deepEqual(changes, [
    { path: "school.grade", section: "school", label: "学年（手動設定）", before: "", after: "小学5年" },
  ]);
});

test("変更履歴：何も変えずに保存した場合は 0 件（履歴を作らない）", () => {
  assert.deepEqual(diffPersonalSave({ before: BEFORE, personal: { ...BEFORE.personal, name: " 山田 太郎 " }, grade: " " }), []);
  assert.deepEqual(diffSectionSave({ before: BEFORE, key: "guardian", value: BEFORE.guardian }), []);
  assert.deepEqual(diffSectionSave({ before: BEFORE, key: "contract", value: BEFORE.contract }), []);
  assert.deepEqual(diffSectionSave({ before: BEFORE, key: "school", value: BEFORE.school }), []);
  assert.deepEqual(diffSectionSave({ before: BEFORE, key: "consultationSupport", value: BEFORE.consultationSupport }), []);
});

test("変更履歴：保護者（氏名・住所は利用者と同じ）", () => {
  const changes = diffSectionSave({
    before: BEFORE,
    key: "guardian",
    value: { ...BEFORE.guardian, name: "山田 華子", sameAddressAsBeneficiary: true },
  });
  assert.deepEqual(changes, [
    { path: "guardian.name", section: "guardian", label: "保護者氏名", before: "山田 花子", after: "山田 華子" },
    {
      path: "guardian.sameAddressAsBeneficiary",
      section: "guardian",
      label: "保護者の住所（利用者と同じ）",
      before: false,
      after: true,
    },
  ]);
  assert.equal(formatChartHistoryValue("guardian.sameAddressAsBeneficiary", true), "利用者と同じ");
  assert.equal(formatChartHistoryValue("guardian.sameAddressAsBeneficiary", false), "別の住所");
});

test("変更履歴：契約（日付・契約状態は画面と同じ表記で表示）", () => {
  const changes = diffSectionSave({
    before: BEFORE,
    key: "contract",
    value: { ...BEFORE.contract, endDate: "2026-03-31", contractStatus: "ended" },
  });
  assert.deepEqual(changes.map((c) => [c.path, c.before, c.after]), [
    ["contract.endDate", "", "2026-03-31"],
    ["contract.contractStatus", "active", "ended"],
  ]);
  assert.equal(formatChartHistoryValue("contract.endDate", "2026-03-31"), "2026年3月31日");
  assert.equal(formatChartHistoryValue("contract.contractStatus", "ended"), "契約終了");
  assert.equal(formatChartHistoryValue("contract.endDate", ""), "未入力");
});

test("変更履歴：学校・相談支援", () => {
  assert.deepEqual(
    diffSectionSave({ before: BEFORE, key: "school", value: { ...BEFORE.school, teacherName: "佐藤先生" } }).map((c) => [c.path, c.label, c.after]),
    [["school.teacherName", "担任名", "佐藤先生"]]
  );
  assert.deepEqual(
    diffSectionSave({
      before: BEFORE,
      key: "consultationSupport",
      value: { ...BEFORE.consultationSupport, officeName: "△△相談支援", specialistName: "鈴木" },
    }).map((c) => [c.path, c.label, c.before, c.after]),
    [
      ["consultationSupport.officeName", "相談支援事業所", "〇〇相談支援センター", "△△相談支援"],
      ["consultationSupport.specialistName", "相談支援専門員", "", "鈴木"],
    ]
  );
});

function candidate(target: CertificateReviewCandidate["target"], proposedValue: string): CertificateReviewCandidate {
  return {
    target,
    reviewKey: target.replace(".", "_"),
    label: "",
    status: "different",
    certValue: proposedValue,
    proposedValue,
    chartValue: "",
    initiallySelected: false,
    source: { pageNo: 1, formKey: "x" },
  };
}

test("変更履歴：受給者証からの反映（B7）もカルテの項目だけを記録し、profile の写しは記録しない", () => {
  const updates = buildChartFieldUpdates([
    candidate("personal.name", "山田 太朗"),
    candidate("personal.birthDate", "2015-05-11"),
    candidate("guardian.name", "山田 華子"),
  ]);
  // B7 の更新内容には profile の写しも含まれる
  assert.equal(updates["profile.name"], "山田 太朗");
  const changes = diffFieldUpdates({ before: BEFORE, updates });
  assert.deepEqual(changes, [
    { path: "personal.name", section: "personal", label: "氏名", before: "山田 太郎", after: "山田 太朗" },
    { path: "personal.birthDate", section: "personal", label: "生年月日", before: "2015-05-10", after: "2015-05-11" },
    { path: "guardian.name", section: "guardian", label: "保護者氏名", before: "山田 花子", after: "山田 華子" },
  ]);
});

test("変更履歴：B7 の反映前の値はカルテに保存されている値（profile で補わない）。同じ値・カルテ外のパスは無視", () => {
  const legacy = sections({}); // personal の無い旧データ
  assert.deepEqual(
    diffFieldUpdates({ before: legacy, updates: { "personal.furigana": "ヤマダ タロウ", "profile.furigana": "ヤマダ タロウ" } }),
    [{ path: "personal.furigana", section: "personal", label: "フリガナ", before: "", after: "ヤマダ タロウ" }]
  );
  assert.deepEqual(diffFieldUpdates({ before: BEFORE, updates: { "guardian.name": "山田 花子" } }), []);
  assert.deepEqual(diffFieldUpdates({ before: BEFORE, updates: { "summary.name": "x", "personal.unknown": "x" } }), []);
});

test("変更履歴：保存する内容（誰が・どの操作・どのセクション・証ID）", () => {
  const changes = diffSectionSave({ before: BEFORE, key: "guardian", value: { ...BEFORE.guardian, name: "山田 華子" } });
  const record = buildChartHistoryRecord({
    beneficiaryId: "b1",
    source: "certificateReview",
    changes,
    certificateId: "cert9",
    actor: { uid: "u1", email: "kita@example.com", displayName: "北" },
  });
  assert.deepEqual(record, {
    schemaVersion: 1,
    beneficiaryId: "b1",
    source: "certificateReview",
    sections: ["guardian"],
    changes,
    certificateId: "cert9",
    actor: { uid: "u1", email: "kita@example.com", displayName: "北" },
  });
  // createdAt はここでは付けない（サーバー時刻を chartStore が付け、Rules が request.time と一致することを確認する）
  assert.equal("createdAt" in record, false);
  assert.equal(
    buildChartHistoryRecord({ beneficiaryId: "b1", source: "chartEdit", changes, actor: { uid: "u1", email: null, displayName: "" } }).certificateId,
    null
  );
});

test("変更履歴：読み取り（日時・変更者・想定外の形）", () => {
  const at = new Date("2026-10-04T01:32:00Z");
  const entry = readChartHistoryEntry("h1", {
    source: "chartEdit",
    changes: [
      { path: "guardian.name", label: "保護者氏名", before: "山田 花子", after: "山田 華子" },
      { label: "壊れたデータ" },
    ],
    actor: { uid: "u1", email: "kita@example.com", displayName: "北" },
    createdAt: { toDate: () => at },
  });
  assert.equal(entry.changes.length, 1);
  assert.deepEqual(entry.sections, ["guardian"]);
  assert.equal(entry.createdAt?.toISOString(), at.toISOString());
  assert.equal(formatChartHistoryTime(entry.createdAt), "2026/10/4 10:32");
  assert.equal(actorDisplayName(entry.actor), "北さん");

  const empty = readChartHistoryEntry("h2", null);
  assert.equal(empty.source, "chartEdit");
  assert.deepEqual(empty.changes, []);
  assert.equal(empty.createdAt, null);
  assert.equal(formatChartHistoryTime(null), "保存中");
});

test("変更履歴：変更者の表示名が無い場合はメールアドレス、どちらも無ければ「不明なスタッフ」", () => {
  assert.equal(actorDisplayName({ displayName: "", email: "staff@example.com" }), "staff@example.com");
  assert.equal(actorDisplayName({ displayName: "  ", email: null }), "不明なスタッフ");
});
