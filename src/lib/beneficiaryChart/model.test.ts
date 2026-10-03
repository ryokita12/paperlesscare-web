import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonalUpdate,
  buildSectionUpdate,
  EMPTY_GUARDIAN,
  EMPTY_PERSONAL,
  initialPersonalForm,
  matchesChartSearch,
  readChartSections,
  resolveChartIdentity,
  resolveGuardianAddress,
  validateContract,
  validateGuardian,
  validatePersonal,
  type LegacyIdentity,
} from "./model.ts";

const TODAY = new Date(2025, 9, 1); // 2025-10-01

function legacy(overrides: Partial<{ profile: Partial<LegacyIdentity["profile"]>; summary: Partial<LegacyIdentity["summary"]> }> = {}): LegacyIdentity {
  return {
    profile: { name: "", furigana: "", birthday: "", ...overrides.profile },
    summary: { name: "", furigana: "", number: "", birthday: "", cityName: "", ...overrides.summary },
  };
}

test("readChartSections: Phase 1-A 以前の利用者doc（マップなし）でも既定値で読める", () => {
  const sections = readChartSections({ tenantId: "t1", profile: { name: "山田 太郎" }, currentCertificateId: null });
  assert.deepEqual(sections.personal, EMPTY_PERSONAL);
  assert.deepEqual(sections.guardian, EMPTY_GUARDIAN);
  assert.equal(sections.school.grade, "");
  assert.deepEqual(readChartSections(undefined).personal, EMPTY_PERSONAL);
});

test("readChartSections: 想定外の型・値は既定値に置き換える", () => {
  const sections = readChartSections({
    personal: { name: 123, birthDate: "平成20年4月1日", usageStatus: "unknown", phone: "090" },
    guardian: { sameAddressAsBeneficiary: "yes" },
    contract: { contractStatus: "active", startDate: "2025-04-01" },
    school: "壊れたデータ",
  });
  assert.equal(sections.personal.name, "");
  assert.equal(sections.personal.birthDate, ""); // ISO以外は正本として扱わない
  assert.equal(sections.personal.usageStatus, "");
  assert.equal(sections.personal.phone, "090");
  assert.equal(sections.guardian.sameAddressAsBeneficiary, false);
  assert.equal(sections.contract.contractStatus, "active");
  assert.equal(sections.contract.startDate, "2025-04-01");
  assert.equal(sections.school.schoolName, "");
});

test("resolveChartIdentity: カルテ未入力の既存利用者は profile → summary の順に使う", () => {
  const sections = readChartSections({});
  const fromProfile = resolveChartIdentity(
    legacy({ profile: { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "平成27年5月10日" }, summary: { name: "山田太郎" } }),
    sections,
    TODAY
  );
  assert.equal(fromProfile.name, "山田 太郎");
  assert.equal(fromProfile.birthDate, "2015-05-10");
  assert.equal(fromProfile.birthDateSource, "profile");
  assert.equal(fromProfile.age, 10);
  assert.equal(fromProfile.grade, "小学4年"); // 2022年4月に小学1年
  assert.equal(fromProfile.gradeSource, "auto");

  const fromSummary = resolveChartIdentity(legacy({ summary: { name: "鈴木 花子", birthday: "令和元年5月1日" } }), sections, TODAY);
  assert.equal(fromSummary.name, "鈴木 花子");
  assert.equal(fromSummary.birthDate, "2019-05-01");
  assert.equal(fromSummary.birthDateSource, "certificate");
});

test("resolveChartIdentity: 読めない生年月日は元の文字列を残し、年齢・学年は出さない", () => {
  const id = resolveChartIdentity(legacy({ profile: { name: "A", birthday: "H20.4.1頃" } }), readChartSections({}), TODAY);
  assert.equal(id.birthDate, null);
  assert.equal(id.birthDateRawText, "H20.4.1頃");
  assert.equal(id.age, null);
  assert.equal(id.grade, "");
  assert.equal(id.gradeSource, "none");
});

test("resolveChartIdentity: カルテの値（personal・手動学年）を最優先する", () => {
  const sections = readChartSections({
    personal: { name: "山田 太郎（カルテ）", birthDate: "2014-06-01" },
    school: { grade: "小学3年（就学猶予）" },
  });
  const id = resolveChartIdentity(legacy({ profile: { name: "OCRの氏名", birthday: "平成27年5月10日" } }), sections, TODAY);
  assert.equal(id.name, "山田 太郎（カルテ）");
  assert.equal(id.birthDate, "2014-06-01");
  assert.equal(id.birthDateSource, "chart");
  assert.equal(id.grade, "小学3年（就学猶予）");
  assert.equal(id.gradeSource, "manual");
});

test("initialPersonalForm: 未保存の利用者は既存の氏名・生年月日を初期値にする", () => {
  const sections = readChartSections({});
  const identity = resolveChartIdentity(legacy({ summary: { name: "鈴木 花子", birthday: "平成30年1月2日" } }), sections, TODAY);
  const form = initialPersonalForm(sections, identity);
  assert.equal(form.name, "鈴木 花子");
  assert.equal(form.birthDate, "2018-01-02");
});

test("buildPersonalUpdate: personal・手動学年・profileの写しだけを更新し、既存の他フィールドに触れない", () => {
  const update = buildPersonalUpdate({
    personal: { ...EMPTY_PERSONAL, name: " 山田 太郎 ", furigana: "ヤマダ タロウ", birthDate: "2015-05-10", usageStatus: "active" },
    grade: " 小学5年 ",
    currentProfile: { name: "旧", furigana: "", birthday: "平成27年5月10日" },
  });
  assert.deepEqual(Object.keys(update).sort(), ["personal", "profile", "school.grade"]);
  assert.equal((update.personal as { name: string }).name, "山田 太郎");
  assert.equal(update["school.grade"], "小学5年");
  assert.deepEqual(update.profile, { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "2015年5月10日" });
  for (const key of ["summary", "currentCertificateId", "certificateCount", "certType", "status", "pages"]) {
    assert.equal(key in update, false, `${key} must not be written`);
  }
});

test("buildPersonalUpdate: 生年月日が未入力なら既存の profile.birthday（和暦）を残す", () => {
  const update = buildPersonalUpdate({
    personal: { ...EMPTY_PERSONAL, name: "A" },
    grade: "",
    currentProfile: { name: "A", furigana: "", birthday: "平成27年5月10日" },
  });
  assert.equal((update.profile as { birthday: string }).birthday, "平成27年5月10日");
});

test("buildSectionUpdate: そのセクションのマップだけを書き、想定外のキーは落とす", () => {
  const update = buildSectionUpdate("guardian", {
    ...EMPTY_GUARDIAN,
    name: " 山田 花子 ",
    sameAddressAsBeneficiary: true,
    // @ts-expect-error 想定外のキー
    injected: "x",
  });
  assert.deepEqual(Object.keys(update), ["guardian"]);
  const g = update.guardian as Record<string, unknown>;
  assert.equal(g.name, "山田 花子");
  assert.equal(g.sameAddressAsBeneficiary, true);
  assert.equal("injected" in g, false);
});

test("resolveGuardianAddress: 「利用者と同じ住所」なら利用者の住所を使う（保護者側の入力は保持）", () => {
  const sections = readChartSections({
    personal: { postalCode: "460-0001", address: "名古屋市中区" },
    guardian: { sameAddressAsBeneficiary: true, postalCode: "100-0001", address: "東京都" },
  });
  assert.deepEqual(resolveGuardianAddress(sections), { postalCode: "460-0001", address: "名古屋市中区" });
  sections.guardian.sameAddressAsBeneficiary = false;
  assert.deepEqual(resolveGuardianAddress(sections), { postalCode: "100-0001", address: "東京都" });
});

test("入力チェック", () => {
  assert.equal(validatePersonal({ ...EMPTY_PERSONAL }, TODAY).name, "氏名を入力してください");
  assert.deepEqual(validatePersonal({ ...EMPTY_PERSONAL, name: "A", postalCode: "4600001", phone: "052-123-4567" }, TODAY), {});
  assert.ok(validatePersonal({ ...EMPTY_PERSONAL, name: "A", birthDate: "2030-01-01" }, TODAY).birthDate);
  assert.ok(validatePersonal({ ...EMPTY_PERSONAL, name: "A", postalCode: "46-1" }, TODAY).postalCode);
  assert.ok(validateGuardian({ ...EMPTY_GUARDIAN, email: "abc" }).email);
  assert.equal(validateGuardian({ ...EMPTY_GUARDIAN, sameAddressAsBeneficiary: true, postalCode: "x" }).postalCode, undefined);
  assert.ok(validateContract({ contractDate: "", startDate: "2025-04-01", endDate: "2025-03-01", contractedAmount: "", providerEntryNumber: "", contractStatus: "" }).endDate);
});

test("matchesChartSearch: 氏名・フリガナ（ひらがな入力可）・受給者証番号で検索できる", () => {
  const target = {
    identity: { name: "山田 太郎", furigana: "ヤマダ タロウ" },
    record: legacy({ summary: { name: "山田太郎", number: "1234567890" } }),
  };
  assert.equal(matchesChartSearch(target, ""), true);
  assert.equal(matchesChartSearch(target, "山田"), true);
  assert.equal(matchesChartSearch(target, "やまだ"), true);
  assert.equal(matchesChartSearch(target, "ﾀﾛｳ"), true);
  assert.equal(matchesChartSearch(target, "4567"), true);
  assert.equal(matchesChartSearch(target, "１２３４"), true);
  assert.equal(matchesChartSearch(target, "鈴木"), false);
});
