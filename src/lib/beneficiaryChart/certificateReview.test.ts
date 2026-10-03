// Phase 1-B7：受給者証（tsusho）→ カルテ反映候補の確認ロジック。データはすべて架空。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCertificateReview,
  buildChartFieldUpdates,
  buildReviewDecisions,
  chartSnapshotForReview,
  initialSelection,
  planCertificateReview,
  readChartReviewDecisions,
  REVIEW_TARGETS,
  reviewTargetLabel,
  type CertificateReviewCandidate,
  type ReviewInput,
  type ReviewTarget,
} from "./certificateReview.ts";
import { EMPTY_SECTIONS, type BeneficiaryChartSections } from "./model.ts";

type Face = Record<string, string>;

const CERT_FACE1: Face = {
  name: "架空 太朗",
  furigana: "カクウ タロウ",
  birthday: "平成28年5月10日",
  guardianName: "架空 花子",
  guardianFurigana: "カクウ ハナコ",
  guardianBirthday: "昭和60年1月1日",
  guardianAddress: "架空市架空町1-2-3",
};
const CERT_FACE4: Face = { planOfficeName: "架空相談支援センター" };

function pages(face1: Face = CERT_FACE1, face4: Face = CERT_FACE4) {
  return [
    { pageNo: 1, formData: face1 },
    { pageNo: 4, formData: face4 },
  ];
}

function sections(patch: {
  personal?: Partial<BeneficiaryChartSections["personal"]>;
  guardian?: Partial<BeneficiaryChartSections["guardian"]>;
  consultationSupport?: Partial<BeneficiaryChartSections["consultationSupport"]>;
} = {}): BeneficiaryChartSections {
  return {
    ...EMPTY_SECTIONS,
    personal: { ...EMPTY_SECTIONS.personal, ...patch.personal },
    guardian: { ...EMPTY_SECTIONS.guardian, ...patch.guardian },
    consultationSupport: { ...EMPTY_SECTIONS.consultationSupport, ...patch.consultationSupport },
  };
}

const NO_PROFILE = { profile: { name: "", furigana: "", birthday: "" } };

function input(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return { certType: "tsusho", pages: pages(), record: NO_PROFILE, sections: sections(), ...overrides };
}

function find(candidates: readonly CertificateReviewCandidate[], target: ReviewTarget) {
  return candidates.find((c) => c.target === target);
}

function targets(candidates: readonly CertificateReviewCandidate[]) {
  return candidates.map((c) => c.target);
}

// ---------- 対応・項目名 ----------

test("対応：児童→personal、保護者→guardian、四面の相談支援→consultationSupport.officeName（B1 の対応のまま）", () => {
  const review = buildCertificateReview(input());
  assert.deepEqual(targets(review.candidates), [
    "personal.name",
    "personal.furigana",
    "personal.birthDate",
    "guardian.name",
    "guardian.furigana",
    "guardian.address",
    "consultationSupport.officeName",
  ]);
  assert.equal(find(review.candidates, "personal.birthDate")?.proposedValue, "2016-05-10");
  assert.deepEqual(find(review.candidates, "consultationSupport.officeName")?.source, {
    pageNo: 4,
    formKey: "planOfficeName",
  });
});

test("項目名：内部のフィールドパスではなく、カルテの項目名で表示する", () => {
  assert.equal(reviewTargetLabel("personal.name"), "氏名");
  assert.equal(reviewTargetLabel("personal.furigana"), "フリガナ");
  assert.equal(reviewTargetLabel("personal.birthDate"), "生年月日");
  assert.equal(reviewTargetLabel("guardian.name"), "保護者氏名");
  assert.equal(reviewTargetLabel("guardian.furigana"), "保護者フリガナ");
  assert.equal(reviewTargetLabel("guardian.address"), "保護者住所");
  assert.equal(reviewTargetLabel("consultationSupport.officeName"), "相談支援事業所");
  for (const c of buildCertificateReview(input()).candidates) {
    assert.equal(/\./.test(c.label), false, c.label);
    assert.equal(/\./.test(c.reviewKey), false, `${c.reviewKey}（Firestore のフィールドパスに "." を使わない）`);
  }
});

test("禁止：personal.address・郵便番号・guardianBirthday・電話番号の候補は作らない", () => {
  const all = Object.keys(REVIEW_TARGETS);
  for (const t of all) assert.equal(/address$/.test(t) && t.startsWith("personal"), false, t);
  for (const c of buildCertificateReview(input()).candidates) {
    assert.equal(/postalCode|phone|birthday|personal\.address|relationship|email/.test(c.target), false, c.target);
  }
});

// ---------- 状態・初期チェック ----------

test("chartEmpty：カルテが空なら表示し、初期 ON", () => {
  const review = buildCertificateReview(input());
  const c = find(review.candidates, "personal.furigana");
  assert.equal(c?.status, "chartEmpty");
  assert.equal(c?.initiallySelected, true);
  assert.ok(initialSelection(review.candidates).has("personal.furigana"));
});

test("different：カルテと証が違えば表示し、初期 OFF", () => {
  const review = buildCertificateReview(input({ sections: sections({ personal: { name: "架空 太郎" } }) }));
  const c = find(review.candidates, "personal.name");
  assert.equal(c?.status, "different");
  assert.equal(c?.initiallySelected, false);
  assert.equal(c?.chartValue, "架空 太郎");
  assert.equal(c?.certValue, "架空 太朗");
  assert.equal(initialSelection(review.candidates).has("personal.name"), false);
});

test("same：正規化して同じなら表示しない（空白・ひらがな・和暦の違いは同じとみなす）", () => {
  const review = buildCertificateReview(
    input({
      sections: sections({
        personal: { name: "架空　太朗", furigana: "かくう たろう", birthDate: "2016-05-10" },
        guardian: { name: "架空花子", furigana: "カクウ ハナコ", address: "架空市架空町1－2－3" },
        consultationSupport: { officeName: "架空相談支援センター" },
      }),
    })
  );
  assert.deepEqual(review.candidates, []);
});

test("certEmpty：証が空なら表示しない（カルテを空にする候補を作らない）", () => {
  const review = buildCertificateReview(
    input({
      pages: pages({ name: "", furigana: "", birthday: "" }, {}),
      sections: sections({
        personal: { name: "架空 太郎", furigana: "カクウ タロウ", birthDate: "2016-05-10" },
        consultationSupport: { officeName: "既存事業所" },
      }),
    })
  );
  assert.deepEqual(review.candidates, []);
});

test("certEmpty：生年月日が日付として読めない場合も候補にしない", () => {
  const review = buildCertificateReview(input({ pages: pages({ ...CERT_FACE1, birthday: "平成二十八年?" }) }));
  assert.equal(find(review.candidates, "personal.birthDate"), undefined);
});

// ---------- 18歳以上の同一人物 ----------

test("同一人物：保護者欄と児童欄の氏名＋生年月日が一致すれば guardian の候補を出さない", () => {
  const self: Face = {
    name: "架空 成人",
    furigana: "カクウ セイジン",
    birthday: "平成17年4月1日",
    guardianName: "架空　成人",
    guardianFurigana: "カクウ セイジン",
    guardianBirthday: "平成17年4月1日",
    guardianAddress: "架空市架空町9-9",
  };
  const review = buildCertificateReview(input({ pages: pages(self) }));
  assert.equal(review.guardianSameAsChild, true);
  assert.equal(review.candidates.some((c) => c.target.startsWith("guardian.")), false);
  assert.ok(find(review.candidates, "personal.name"));
});

// ---------- 種別 ----------

test("adult / child / mobility の証では候補を作らない（tsusho のみ）", () => {
  for (const certType of ["adult", "child", "mobility", ""]) {
    assert.deepEqual(buildCertificateReview(input({ certType })).candidates, [], certType);
  }
});

// ---------- 現在のカルテ（personal の無い旧データ） ----------

test("旧データ：personal が空でも profile に氏名があれば、それを現在の値として比べる（未入力扱いで初期 ON にしない）", () => {
  const record = { profile: { name: "架空 太郎", furigana: "", birthday: "平成28年5月10日" } };
  const review = buildCertificateReview(input({ record }));
  assert.equal(find(review.candidates, "personal.name")?.status, "different");
  assert.equal(find(review.candidates, "personal.name")?.initiallySelected, false);
  assert.equal(find(review.candidates, "personal.birthDate"), undefined, "和暦の profile.birthday と同じ日付");
  assert.equal(find(review.candidates, "personal.furigana")?.status, "chartEmpty");
});

test("現在のカルテ：personal に値があれば personal を優先する", () => {
  const snap = chartSnapshotForReview(
    { profile: { name: "旧 表示名", furigana: "キュウ", birthday: "" } },
    sections({ personal: { name: "架空 太郎" } })
  );
  assert.equal(snap.personal.name, "架空 太郎");
  assert.equal(snap.personal.furigana, "キュウ");
});

// ---------- chartReview による再表示の制御 ----------

function decideAll(review = buildCertificateReview(input()), mode: "apply" | "dismiss" = "dismiss") {
  const selected = initialSelection(review.candidates);
  const plan = planCertificateReview({ shown: review.candidates, selected, mode, latest: input() });
  return buildReviewDecisions(plan, mode === "apply" ? selected : new Set());
}

test("chartReview：判断済み（反映しない）の同じ値の候補は再表示しない", () => {
  const decisions = decideAll();
  const again = buildCertificateReview({ ...input(), chartReview: { decisions } });
  assert.deepEqual(again.candidates, []);
});

test("chartReview：証の値を訂正して値が変わった項目だけ、再び候補に出す", () => {
  const decisions = decideAll();
  const corrected = pages({ ...CERT_FACE1, name: "架空 太郎" });
  const again = buildCertificateReview({ ...input({ pages: corrected }), chartReview: { decisions } });
  assert.deepEqual(targets(again.candidates), ["personal.name"]);
});

test("chartReview：想定外の形の記録は無視する（画面を止めない）", () => {
  assert.deepEqual(readChartReviewDecisions(undefined), {});
  assert.deepEqual(readChartReviewDecisions("x"), {});
  assert.deepEqual(readChartReviewDecisions({ decisions: { personal_name: { action: "other" } } }), {});
  const review = buildCertificateReview({ ...input(), chartReview: { decisions: [1, 2] } });
  assert.equal(review.candidates.length, 7);
});

// ---------- 反映の計画 ----------

test("反映：チェックした項目だけ反映し、チェックしなかった項目は「反映しない」として記録する", () => {
  const review = buildCertificateReview(input());
  const selected = new Set<ReviewTarget>(["personal.name", "guardian.name"]);
  const plan = planCertificateReview({ shown: review.candidates, selected, mode: "apply", latest: input() });
  assert.deepEqual(targets(plan.applied), ["personal.name", "guardian.name"]);
  assert.equal(plan.dismissed.length, 5);
  assert.deepEqual(plan.stale, []);

  const decisions = buildReviewDecisions(plan, selected);
  assert.equal(decisions.personal_name?.action, "applied");
  assert.equal(decisions.personal_name?.selected, true);
  assert.equal(decisions.personal_furigana?.action, "dismissed");
  assert.equal(decisions.personal_furigana?.selected, false);
  assert.equal(decisions.personal_furigana?.initiallySelected, true);
  assert.equal(decisions.personal_furigana?.status, "chartEmpty");
  assert.equal(decisions.personal_name?.certValue, "架空 太朗");
  assert.equal(decisions.personal_name?.chartValueBefore, "");
});

test("今回は反映しない：すべて dismissed、反映する項目は 0 件（カルテの更新内容は空）", () => {
  const review = buildCertificateReview(input());
  const plan = planCertificateReview({
    shown: review.candidates,
    selected: initialSelection(review.candidates),
    mode: "dismiss",
    latest: input(),
  });
  assert.deepEqual(plan.applied, []);
  assert.equal(plan.dismissed.length, review.candidates.length);
  assert.deepEqual(buildChartFieldUpdates(plan.applied), {});
  const decisions = buildReviewDecisions(plan, new Set());
  assert.ok(Object.values(decisions).every((d) => d?.action === "dismissed" && d.selected === false));
});

test("同時編集：表示後にカルテの値が変わった項目は反映も記録もしない（stale）", () => {
  const shown = buildCertificateReview(input({ sections: sections({ personal: { name: "架空 太郎" } }) }));
  const selected = new Set<ReviewTarget>(["personal.name", "personal.furigana"]);
  const latest = input({ sections: sections({ personal: { name: "別の操作 太郎" } }) });
  const plan = planCertificateReview({ shown: shown.candidates, selected, mode: "apply", latest });
  assert.deepEqual(targets(plan.stale), ["personal.name"]);
  assert.deepEqual(targets(plan.applied), ["personal.furigana"]);
  assert.equal(buildChartFieldUpdates(plan.applied)["personal.name"], undefined);
  assert.equal(buildReviewDecisions(plan, selected).personal_name, undefined);
});

test("同時編集：表示後に証の値が訂正された項目も stale", () => {
  const shown = buildCertificateReview(input());
  const latest = input({ pages: pages({ ...CERT_FACE1, guardianName: "架空 花代" }) });
  const plan = planCertificateReview({
    shown: shown.candidates,
    selected: new Set(["guardian.name"]),
    mode: "apply",
    latest,
  });
  assert.deepEqual(targets(plan.stale), ["guardian.name"]);
  assert.deepEqual(plan.applied, []);
});

test("同時編集：最新の証が tsusho でなければ、すべて stale", () => {
  const shown = buildCertificateReview(input());
  const plan = planCertificateReview({
    shown: shown.candidates,
    selected: initialSelection(shown.candidates),
    mode: "apply",
    latest: input({ certType: "child" }),
  });
  assert.equal(plan.stale.length, shown.candidates.length);
});

// ---------- 反映の内容（フィールドパス単位） ----------

test("personal の部分更新：選んだ項目だけをフィールドパスで更新し、personal 全体を置き換えない", () => {
  const review = buildCertificateReview(input());
  const applied = review.candidates.filter((c) => c.target === "personal.furigana");
  const updates = buildChartFieldUpdates(applied);
  assert.deepEqual(updates, { "personal.furigana": "カクウ タロウ", "profile.furigana": "カクウ タロウ" });
  assert.equal("personal" in updates, false);
});

test("profile 同期：氏名・フリガナ・生年月日を反映したときだけ profile の同じ項目に写す（生年月日は和暦表記）", () => {
  const review = buildCertificateReview(input());
  const pick = (t: ReviewTarget) => review.candidates.filter((c) => c.target === t);
  assert.deepEqual(buildChartFieldUpdates(pick("personal.name")), {
    "personal.name": "架空 太朗",
    "profile.name": "架空 太朗",
  });
  assert.deepEqual(buildChartFieldUpdates(pick("personal.birthDate")), {
    "personal.birthDate": "2016-05-10",
    "profile.birthday": "2016年5月10日",
  });
  assert.equal("profile" in buildChartFieldUpdates(pick("personal.name")), false, "profile 全体を置き換えない");
});

test("guardian の部分更新：guardian.name だけ（他の項目・profile には触れない）", () => {
  const review = buildCertificateReview(input());
  const updates = buildChartFieldUpdates(review.candidates.filter((c) => c.target === "guardian.name"));
  assert.deepEqual(updates, { "guardian.name": "架空 花子" });
});

test("consultationSupport の部分更新：officeName だけ（専門員名・電話・メールには触れない）", () => {
  const review = buildCertificateReview(
    input({ sections: sections({ consultationSupport: { specialistName: "架空 専門員", phone: "000-0000-0000" } }) })
  );
  const updates = buildChartFieldUpdates(
    review.candidates.filter((c) => c.target === "consultationSupport.officeName")
  );
  assert.deepEqual(updates, { "consultationSupport.officeName": "架空相談支援センター" });
});

test("複数選択：5件の候補から2件を選ぶと、その2件（と profile の写し）だけを更新する", () => {
  const review = buildCertificateReview(
    input({ sections: sections({ personal: { name: "架空 太郎", birthDate: "2016-05-11" } }) })
  );
  const shown = review.candidates.filter((c) =>
    ["personal.name", "personal.furigana", "personal.birthDate", "guardian.name", "guardian.address"].includes(c.target)
  );
  assert.equal(shown.length, 5);
  const selected = new Set<ReviewTarget>(["personal.furigana", "guardian.name"]);
  const plan = planCertificateReview({ shown, selected, mode: "apply", latest: input({
    sections: sections({ personal: { name: "架空 太郎", birthDate: "2016-05-11" } }),
  }) });
  assert.deepEqual(Object.keys(buildChartFieldUpdates(plan.applied)).sort(), [
    "guardian.name",
    "personal.furigana",
    "profile.furigana",
  ]);
  assert.deepEqual(targets(plan.dismissed), ["personal.name", "personal.birthDate", "guardian.address"]);
});

test("summary・受給者証の構造（currentCertificateId / status / supersededBy / pages）は更新内容に含めない", () => {
  const review = buildCertificateReview(input());
  const updates = buildChartFieldUpdates(review.candidates);
  for (const key of Object.keys(updates)) {
    assert.match(key, /^(personal|guardian|consultationSupport|profile)\./, key);
    assert.equal(/summary|currentCertificateId|certificateCount|certType|status|supersededBy|pages/.test(key), false, key);
  }
});
