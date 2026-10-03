// Phase 1-B3：通所受給者証（tsusho）を内部に登録しつつ、管理Web・LINE には出さないことの固定。
// あわせて、既存の mobility / adult / child の定義・表示・選択可否が変わっていないことを固定する。
//
// 【Phase 1-B6 で意図的に更新】
// tsusho を管理Webにだけ公開した（enabled = true / adminVisible = true）。LINE は非公開のまま
// （lineEnabled = false）。管理Webの選択肢・選択可否のテストを「4種類・tsusho は押せる」へ更新し、
// LINE に tsusho が出ないことのテストは従来どおり残している。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminCertTypeOptions,
  CERT_TYPES,
  getPageDefinitions,
  getPageTitle,
  isCertTypeSelectable,
  lineCertTypeOptions,
  PAGE_COUNT,
  PAGE_DEFINITIONS,
} from "./certPages.ts";
import { getCertLayoutId } from "./certLayoutMap.ts";

// ---------- A. 証種別（tsusho） ----------

test("A：tsusho の表示名は「通所受給者証」、管理Webだけ公開（enabled / adminVisible = true、lineEnabled = false）", () => {
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.ok(tsusho);
  assert.equal(tsusho.id, "tsusho");
  assert.equal(tsusho.label, "通所受給者証");
  assert.equal(tsusho.shortLabel, "通所受給者証");
  assert.equal(tsusho.enabled, true);
  assert.equal(tsusho.lineEnabled, false);
  assert.equal(tsusho.adminVisible, true);
  // 選択できる種別なので「準備中」等のバッジは出さない
  assert.equal(tsusho.statusLabel, "");
});

test("A：tsusho は child（障害福祉サービス受給者証・18歳未満）とは別の種別", () => {
  const child = CERT_TYPES.find((t) => t.id === "child");
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.notEqual(child?.label, tsusho?.label);
  assert.equal(child?.label, "障害福祉サービス受給者証（18歳未満）");
});

// ---------- B. 既存の証種別 ----------

test("B：mobility / adult / child の既存の定義（表示名・色・有効状態・バッジ）は変わっていない", () => {
  const pick = (id: string) => {
    const t = CERT_TYPES.find((type) => type.id === id);
    assert.ok(t, id);
    return {
      label: t.label,
      shortLabel: t.shortLabel,
      colorName: t.colorName,
      themeClass: t.themeClass,
      enabled: t.enabled,
      statusLabel: t.statusLabel,
    };
  };

  assert.deepEqual(pick("mobility"), {
    label: "移動支援・地域活動支援 受給者証",
    shortLabel: "移動支援・地域活動支援 受給者証",
    colorName: "クリーム色の受給者証",
    themeClass: "cert-type-cream",
    enabled: false,
    statusLabel: "今後実装予定",
  });
  assert.deepEqual(pick("adult"), {
    label: "障害福祉サービス受給者証（18歳以上）",
    shortLabel: "障害福祉サービス受給者証（18歳以上）",
    colorName: "紫色の受給者証",
    themeClass: "cert-type-purple",
    enabled: true,
    statusLabel: "",
  });
  assert.deepEqual(pick("child"), {
    label: "障害福祉サービス受給者証（18歳未満）",
    shortLabel: "障害福祉サービス受給者証（18歳未満）",
    colorName: "黄緑色の受給者証",
    themeClass: "cert-type-green",
    enabled: true,
    statusLabel: "",
  });
});

test("B：新しいフラグは既存の挙動どおり（adult / child は LINE 可、mobility は管理Webに表示のみ・LINE 不可）", () => {
  const flags = (id: string) => {
    const t = CERT_TYPES.find((type) => type.id === id);
    return { lineEnabled: t?.lineEnabled, adminVisible: t?.adminVisible };
  };
  assert.deepEqual(flags("adult"), { lineEnabled: true, adminVisible: true });
  assert.deepEqual(flags("child"), { lineEnabled: true, adminVisible: true });
  assert.deepEqual(flags("mobility"), { lineEnabled: false, adminVisible: true });
});

// ---------- C. 管理Web ----------

test("C：管理Webの「受給者証の種類」は従来の3種類（同じ順番）の後ろに tsusho を加えた4種類", () => {
  assert.deepEqual(
    adminCertTypeOptions().map((t) => t.id),
    ["mobility", "adult", "child", "tsusho"]
  );
});

test("C：管理Webで押せる種別は adult / child / tsusho（mobility は「今後実装予定」で押せない）", () => {
  assert.deepEqual(
    adminCertTypeOptions().filter((t) => t.enabled).map((t) => t.id),
    ["adult", "child", "tsusho"]
  );
});

// ---------- D. LINE ----------

test("D：LINE の種別選択は従来どおり adult / child だけで、tsusho は出ない", () => {
  // 従来の LINE は CERT_TYPES.filter((t) => t.enabled) を表示していた（＝adult / child）
  assert.deepEqual(
    lineCertTypeOptions().map((t) => t.id),
    ["adult", "child"]
  );
  assert.equal(lineCertTypeOptions().some((t) => t.id === "tsusho"), false);
});

// ---------- 選択可否（既存利用者の種別の初期選択に使う） ----------

test("isCertTypeSelectable：adult / child は両方で選択可、tsusho は管理Webだけ選択可、mobility・未知の種別は不可", () => {
  for (const variant of ["admin", "line"] as const) {
    assert.equal(isCertTypeSelectable("adult", variant), true, `adult/${variant}`);
    assert.equal(isCertTypeSelectable("child", variant), true, `child/${variant}`);
    assert.equal(isCertTypeSelectable("mobility", variant), false, `mobility/${variant}`);
    assert.equal(isCertTypeSelectable("unknown", variant), false, `unknown/${variant}`);
    assert.equal(isCertTypeSelectable(null, variant), false, `null/${variant}`);
  }
  assert.equal(isCertTypeSelectable("tsusho", "admin"), true);
  assert.equal(isCertTypeSelectable("tsusho", "line"), false);
});

// ---------- G. ページ定義 ----------

test("G：tsusho の内部ページ定義は7ページ（一〜七面）", () => {
  const defs = getPageDefinitions("tsusho");
  assert.equal(defs.length, 7);
  assert.deepEqual(
    defs.map((d) => d.pageNo),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.equal(defs[0].title, "通所受給者証（一面）");
  assert.equal(defs[1].title, "障害児通所給付費の給付決定内容（二面）");
  assert.equal(defs[2].title, "障害児通所給付費の給付決定内容（三面）");
  assert.equal(defs[3].title, "障害児相談支援給付費の支給内容（四面）");
  assert.equal(defs[4].title, "利用者負担に関する事項（五面）");
  assert.equal(defs[5].title, "障害児通所支援事業者記入欄（六面）");
  assert.equal(defs[6].title, "障害児通所支援事業者記入欄（七面）");
});

test("G：adult / child / mobility の8ページ定義は変わっていない。PAGE_COUNT は 8 のまま", () => {
  assert.equal(PAGE_COUNT, 8);
  for (const certType of ["mobility", "adult", "child"] as const) {
    assert.equal(getPageDefinitions(certType), PAGE_DEFINITIONS, certType);
    assert.equal(getPageDefinitions(certType).length, 8, certType);
  }
  assert.equal(getPageTitle("adult", 0), "障害福祉サービス受給者証（Ⅰ）");
  assert.equal(getPageTitle("child", 7), "利用者負担に関する事項②");
});

// ---------- レイアウト ----------

test("レイアウト：tsusho の一〜七面は専用レイアウトに解決され、adult / child のレイアウトを流用しない", () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => getCertLayoutId("tsusho", i)),
    [
      "tsushoBasic",
      "tsushoDecision2",
      "tsushoDecision3",
      "tsushoConsultation",
      "tsushoBurden",
      "tsushoProvider6",
      "tsushoProvider7",
    ]
  );
});
