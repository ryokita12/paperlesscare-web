import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFormData } from "../../constants/certPages.ts";
import { isPage2, migrateLegacyPage2FormData } from "./legacyPage2.ts";

test("isPage2: pageNo があればそれを、無ければ配列添字を使う", () => {
  assert.equal(isPage2(2, 0), true);
  assert.equal(isPage2(1, 1), false);
  assert.equal(isPage2(undefined, 1), true);
  assert.equal(isPage2(undefined, 0), false);
});

test("migrateLegacyPage2FormData: 旧フィールドの値を serviceType1 系へ移送する", () => {
  const legacy = {
    ...emptyFormData(),
    name: "短期入所",
    birthday: "令和7年4月1日から令和8年3月31日まで",
    childName: "7日/月",
  };

  const migrated = migrateLegacyPage2FormData(legacy);

  assert.equal(migrated.serviceType1, "短期入所");
  assert.equal(
    migrated.servicePeriod1,
    "令和7年4月1日から令和8年3月31日まで"
  );
  assert.equal(migrated.serviceAmount1, "7日/月");
});

test("migrateLegacyPage2FormData: 移送元の旧フィールドは空にする（コピーではなく移動）", () => {
  const legacy = {
    ...emptyFormData(),
    name: "短期入所",
    birthday: "令和7年4月1日から令和8年3月31日まで",
    childName: "7日/月",
  };

  const migrated = migrateLegacyPage2FormData(legacy);

  assert.equal(migrated.name, "");
  assert.equal(migrated.birthday, "");
  assert.equal(migrated.childName, "");
});

test("migrateLegacyPage2FormData: 新フィールドに値がある場合は上書きしない", () => {
  const mixed = {
    ...emptyFormData(),
    serviceType1: "生活介護",
    name: "短期入所",
  };

  const migrated = migrateLegacyPage2FormData(mixed);

  assert.equal(migrated.serviceType1, "生活介護");
  // 新フィールドを優先した場合、旧フィールドは参照されないためそのまま残す
  assert.equal(migrated.name, "短期入所");
});

test("migrateLegacyPage2FormData: 項目ごとに独立して移送する", () => {
  const partial = {
    ...emptyFormData(),
    servicePeriod1: "令和7年4月1日から令和8年3月31日まで",
    name: "短期入所",
    birthday: "令和1年1月1日から令和2年1月1日まで",
    childName: "7日/月",
  };

  const migrated = migrateLegacyPage2FormData(partial);

  // servicePeriod1 は既に値があるので birthday は移送されない
  assert.equal(
    migrated.servicePeriod1,
    "令和7年4月1日から令和8年3月31日まで"
  );
  assert.equal(migrated.birthday, "令和1年1月1日から令和2年1月1日まで");

  // 他の2項目は移送される
  assert.equal(migrated.serviceType1, "短期入所");
  assert.equal(migrated.name, "");
  assert.equal(migrated.serviceAmount1, "7日/月");
  assert.equal(migrated.childName, "");
});

test("migrateLegacyPage2FormData: 移送が不要なら同一オブジェクトをそのまま返す", () => {
  const current = {
    ...emptyFormData(),
    serviceType1: "生活介護",
    servicePeriod1: "令和7年4月1日から令和8年3月31日まで",
    serviceAmount1: "20日/月",
  };

  assert.equal(migrateLegacyPage2FormData(current), current);
});

test("migrateLegacyPage2FormData: 新形式で保存された空データは変化しない", () => {
  const empty = emptyFormData();
  assert.equal(migrateLegacyPage2FormData(empty), empty);
});
