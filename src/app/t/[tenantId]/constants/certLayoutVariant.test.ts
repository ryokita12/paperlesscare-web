import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_COUNT, CERT_TYPES } from "./certPages.ts";
import {
  getCertLayoutId,
  hasContactInfoRow,
  type CertLayoutId,
} from "./certLayoutMap.ts";

// Phase 2（adult／child共通layout基盤＋child page6差分）の検証。
//
// 帳票レイアウトの実体は components/certLayouts.tsx にありJSXを含むため、
// 現在のテスト環境（node --experimental-strip-types）ではimportできない。
// そこで、レイアウト実装もテストも参照する純粋な定義
// （getCertLayoutId / hasContactInfoRow）を境界として検証する。
// certLayouts.tsx はこの定義を使って「問い合わせ先」行の有無を決めているため、
// ここで固定した仕様と描画がずれることはない。

// 様式画像で確認した adult のページ構成（Phase 2 で変更していないこと）
const ADULT_EXPECTED: readonly CertLayoutId[] = [
  "certificate1", // page1 障害福祉サービス受給者証（Ⅰ）
  "careBenefit1", // page2 介護給付費の支給決定内容
  "careBenefit2", // page3 介護給付費の支給決定内容（つづき）
  "trainingBenefit", // page4 訓練等給付費の支給決定内容
  "certificate2", // page5 障害福祉サービス受給者証（Ⅱ）
  "planSupport", // page6 計画相談支援（問い合わせ先なし）
  "userBurden", // page7 利用者負担に関する事項
  "userBurden", // page8 様式未確認のため adult の既存割り当てを踏襲
];

// adult と child で同一レイアウトを共有するページ（0始まり）
const SHARED_PAGE_INDEXES = [0, 1, 2, 3, 4, 6] as const;

const PAGE6_INDEX = 5;
const PAGE8_INDEX = 7;

// --- adult 表示の回帰 ---

test("adult回帰: page1〜7のレイアウト割り当てが Phase 2 前と変わっていない", () => {
  for (let pageIndex = 0; pageIndex < 7; pageIndex++) {
    assert.equal(
      getCertLayoutId("adult", pageIndex),
      ADULT_EXPECTED[pageIndex],
      `adult / pageIndex=${pageIndex}`
    );
  }
});

test("adult回帰: adult page6 は問い合わせ先を持たない", () => {
  assert.equal(getCertLayoutId("adult", PAGE6_INDEX), "planSupport");
  assert.equal(hasContactInfoRow("planSupport"), false);
});

test("adult回帰: child の差分レイアウトが adult 側へ混入していない", () => {
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    assert.notEqual(
      getCertLayoutId("adult", pageIndex),
      "planSupportWithContact",
      `adult / pageIndex=${pageIndex} に child 専用レイアウトが混入している`
    );
  }
});

test("adult回帰: pageIndex は0始まりのまま（page1 が index 0）", () => {
  assert.equal(getCertLayoutId("adult", 0), "certificate1");
  assert.equal(getCertLayoutId("child", 0), "certificate1");
  assert.notEqual(getCertLayoutId("adult", 1), "certificate1");
});

// --- child 共通layout ---

test("child共通: page1〜5・7は adult とまったく同じレイアウトを共有する", () => {
  for (const pageIndex of SHARED_PAGE_INDEXES) {
    assert.equal(
      getCertLayoutId("child", pageIndex),
      getCertLayoutId("adult", pageIndex),
      `pageIndex=${pageIndex}`
    );
  }
});

test("child共通: 共有ページの問い合わせ先の有無が adult と一致する", () => {
  // 様式で確認できた「問い合わせ先あり」は page4 と page7。
  // 共有ページでは adult / child で差が出てはいけない。
  for (const pageIndex of SHARED_PAGE_INDEXES) {
    assert.equal(
      hasContactInfoRow(getCertLayoutId("child", pageIndex)),
      hasContactInfoRow(getCertLayoutId("adult", pageIndex)),
      `pageIndex=${pageIndex}`
    );
  }
});

test("child共通: page4 と page7 は adult / child とも問い合わせ先あり", () => {
  for (const certType of ["adult", "child"] as const) {
    assert.equal(hasContactInfoRow(getCertLayoutId(certType, 3)), true);
    assert.equal(hasContactInfoRow(getCertLayoutId(certType, 6)), true);
  }
});

test("child共通: childのpageIndex対応が全ページで解決できる", () => {
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    assert.ok(
      getCertLayoutId("child", pageIndex),
      `child / pageIndex=${pageIndex}`
    );
  }
});

// --- child page6 の差分 ---

test("child page6: 専用レイアウトが割り当てられ、問い合わせ先を持つ", () => {
  assert.equal(
    getCertLayoutId("child", PAGE6_INDEX),
    "planSupportWithContact"
  );
  assert.equal(hasContactInfoRow("planSupportWithContact"), true);
});

test("child page6: adult page6 とはレイアウトが異なる", () => {
  assert.notEqual(
    getCertLayoutId("child", PAGE6_INDEX),
    getCertLayoutId("adult", PAGE6_INDEX)
  );
});

test("child page6: 差分が page1〜5・7へ混入していない", () => {
  for (const pageIndex of SHARED_PAGE_INDEXES) {
    assert.notEqual(
      getCertLayoutId("child", pageIndex),
      "planSupportWithContact",
      `child / pageIndex=${pageIndex}`
    );
  }
});

test("child page6: 問い合わせ先を持つレイアウトは様式で確認できた3つだけ", () => {
  const allLayoutIds: readonly CertLayoutId[] = [
    "certificate1",
    "careBenefit1",
    "careBenefit2",
    "trainingBenefit",
    "certificate2",
    "planSupport",
    "planSupportWithContact",
    "userBurden",
  ];

  const withContact = allLayoutIds.filter((id) => hasContactInfoRow(id));

  assert.deepEqual(withContact, [
    "trainingBenefit", // page4
    "planSupportWithContact", // page6（child のみ）
    "userBurden", // page7
  ]);
});

// --- page8 ---

test("page8: 新しいレイアウトを実装しておらず、adult の既存割り当てを踏襲している", () => {
  // page8 のサンプル画像は page1 の複製で様式未確認のため、
  // 専用レイアウト（例: userBurden2 のような新ID）を作っていないことを固定する。
  assert.equal(getCertLayoutId("adult", PAGE8_INDEX), "userBurden");
  assert.equal(getCertLayoutId("child", PAGE8_INDEX), "userBurden");
});

test("page8: page1 のレイアウトへ誤って解決されない", () => {
  for (const certType of CERT_TYPES) {
    assert.notEqual(
      getCertLayoutId(certType.id, PAGE8_INDEX),
      "certificate1",
      `${certType.id} / page8 が page1 のレイアウトになっている`
    );
  }
});

test("page8: 範囲外ページでも例外を投げず、別ページのレイアウトへ流れない", () => {
  for (const certType of CERT_TYPES) {
    for (const pageIndex of [-1, PAGE_COUNT, 99]) {
      const layoutId = getCertLayoutId(certType.id, pageIndex);
      assert.equal(layoutId, "userBurden", `${certType.id} / ${pageIndex}`);
    }
  }
});

// --- feature flag ---

// 【仕様変更に伴い更新したテスト】
// child のレイアウト（Phase 2）を実機で確認できるようにするため、
// child を選択可能へ切り替えた。以前は enabled=false を固定していた。
test("feature flag: child.enabled は true で選択可能", () => {
  const child = CERT_TYPES.find((type) => type.id === "child");

  assert.ok(child, "child 種別が定義されていること");
  assert.equal(child.enabled, true);
});

test("feature flag: 選択可能な種別に adult と child が含まれる", () => {
  // 取込画面は CERT_TYPES の enabled で選択可否を決めている。
  const selectable = CERT_TYPES.filter((type) => type.enabled).map(
    (type) => type.id
  );

  assert.deepEqual(selectable, ["adult", "child"]);
});

test("feature flag: 選択可能な種別には「今後実装予定」バッジを出さない", () => {
  // 取込画面は statusLabel が空でなければバッジを表示する（page.tsx）。
  // 選択できる種別にバッジが残っていると表示が矛盾するため、
  // enabled と statusLabel の整合を固定する。
  for (const type of CERT_TYPES) {
    if (type.enabled) {
      assert.equal(type.statusLabel, "", `${type.id} にバッジが残っている`);
    }
  }

  const child = CERT_TYPES.find((t) => t.id === "child");
  assert.equal(child?.statusLabel, "");
});

test("feature flag: 未実装の mobility にはバッジが残っている", () => {
  const mobility = CERT_TYPES.find((type) => type.id === "mobility");

  assert.equal(mobility?.enabled, false);
  assert.equal(mobility?.statusLabel, "今後実装予定");
});

test("feature flag: mobility は引き続き無効（今回の有効化で状態が変わっていない）", () => {
  const mobility = CERT_TYPES.find((type) => type.id === "mobility");

  assert.ok(mobility, "mobility 種別が定義されていること");
  assert.equal(mobility.enabled, false);
});

test("feature flag: adult は引き続き有効", () => {
  const adult = CERT_TYPES.find((type) => type.id === "adult");

  assert.ok(adult, "adult 種別が定義されていること");
  assert.equal(adult.enabled, true);
});

test("feature flag: child を有効化しても page6 の差分レイアウトが維持されている", () => {
  const child = CERT_TYPES.find((type) => type.id === "child");

  assert.equal(child?.enabled, true);
  assert.equal(
    getCertLayoutId("child", PAGE6_INDEX),
    "planSupportWithContact"
  );
  assert.equal(getCertLayoutId("adult", PAGE6_INDEX), "planSupport");
});
