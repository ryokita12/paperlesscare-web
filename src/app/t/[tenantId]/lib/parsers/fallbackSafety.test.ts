import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCertPageParser,
  isFallbackAllowed,
  parseCertText,
} from "./parseCertText.ts";
import { parseAdultPage1 } from "./adult/page1.ts";
import { parseAdultPage2 } from "./adult/page2.ts";
import { parseAdultPage3 } from "./adult/page3.ts";
import { parseAdultPage4 } from "./adult/page4.ts";
import { PAGE_COUNT, CERT_TYPES } from "../../constants/certPages.ts";
import type { CertTypeId } from "../../constants/certPages.ts";

// 専用パーサが無いページで、人物フィールドが誤った値で埋まらないことを検証する。
//
// 変更前は全ページで parseFallback（様式非依存の緩い抽出）が走っており、
// 支給決定期間の先頭部分が birthday に入る、受給者証番号が address に入る、
// といった「意味の違うフィールドへの値の混入」が起きていた。
//
// テストデータはすべて架空値。

// 旧 parseFallback なら誤抽出し得る要素を意図的に盛り込んだOCRテキスト。
// ・和暦の「期間」（birthday に化けやすい）
// ・受給者証番号らしき10桁（address に化けやすい）
// ・住所らしい行
// ・氏名らしい行
const POLLUTING_TEXT = `介護給付費の支給決定内容
支給決定期間 令和8年4月1日から令和9年3月31日まで
受給者証番号 1234567890
架空県架空市架空町1丁目2番3号
山田 太郎
支給量等
7日/月`;

// 人物情報を表すフィールド。専用パーサが無いページでは、これらが
// 埋まっていないことを保証する。
const PERSON_FIELDS = [
  "name",
  "birthday",
  "address",
  "furigana",
  "childName",
  "childBirthday",
  "childFurigana",
] as const;

function assertNoPersonData(
  result: Record<string, string | undefined>,
  context: string
) {
  for (const field of PERSON_FIELDS) {
    assert.equal(
      result[field],
      "",
      `${context}: ${field} に値が入ってはいけない（実際: ${JSON.stringify(
        result[field]
      )}）`
    );
  }
}

test("安全fallback: 専用パーサが無い adult の非人物ページで人物フィールドが汚染されない", () => {
  // adult のページ5〜8（index 4〜7）は専用パーサ未実装
  for (const pageIndex of [4, 5, 6, 7]) {
    const result = parseCertText(POLLUTING_TEXT, pageIndex, "adult");
    assertNoPersonData(result, `adult / pageIndex=${pageIndex}`);
  }
});

test("安全fallback: 支給期間らしい和暦日付があっても birthday に入らない", () => {
  const result = parseCertText(
    `支給決定期間
令和8年4月1日から令和9年3月31日まで
適用期間
令和8年4月1日から令和9年3月31日まで`,
    6,
    "adult"
  );

  assert.equal(result.birthday, "");
  assert.equal(result.childBirthday, "");
});

test("安全fallback: 氏名らしい文字列があっても対象外ページの name に入らない", () => {
  const result = parseCertText(
    `氏名 山田 太郎
生年月日
平成1年1月1日`,
    5,
    "adult"
  );

  assert.equal(result.name, "");
  assert.equal(result.birthday, "");
});

test("安全fallback: 住所らしい文字列があっても対象外ページの address に入らない", () => {
  const result = parseCertText(
    `居住地
架空県架空市架空町1丁目2番3号
フリガナ
カクウ タロウ`,
    6,
    "adult"
  );

  assert.equal(result.address, "");
});

test("安全fallback: 受給者証番号らしい10桁があっても number / address に入らない", () => {
  const result = parseCertText(
    `受給者証番号
1234567890
居住地`,
    7,
    "adult"
  );

  assert.equal(result.number, "");
  assert.equal(result.address, "");
});

test("安全fallback: child は全ページ未実装のため、どのページでも人物フィールドが汚染されない", () => {
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    const result = parseCertText(POLLUTING_TEXT, pageIndex, "child");
    assertNoPersonData(result, `child / pageIndex=${pageIndex}`);
  }
});

test("安全fallback: mobility も全ページ未実装のため汚染されない", () => {
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    const result = parseCertText(POLLUTING_TEXT, pageIndex, "mobility");
    assertNoPersonData(result, `mobility / pageIndex=${pageIndex}`);
  }
});

test("安全fallback: 想定外のページ番号でも例外を投げず、人物フィールドを埋めない", () => {
  for (const pageIndex of [-1, PAGE_COUNT, 99, 1.5, Number.NaN]) {
    for (const certType of CERT_TYPES) {
      const result = parseCertText(POLLUTING_TEXT, pageIndex, certType.id);
      assertNoPersonData(
        result,
        `${certType.id} / pageIndex=${String(pageIndex)}`
      );
    }
  }
});

test("安全fallback: 未知の certType でも例外を投げず、人物フィールドを埋めない", () => {
  // 型上は起こらないが、保存済みデータの certType が壊れている等の
  // 想定外入力でも安全側に倒れることを確認する。
  const unknownCertType = "unknown" as CertTypeId;

  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    const result = parseCertText(POLLUTING_TEXT, pageIndex, unknownCertType);
    assertNoPersonData(result, `unknown / pageIndex=${pageIndex}`);
  }
});

test("安全fallback: 空のフォームでも FormDataType の必須項目が文字列で揃う", () => {
  const result = parseCertText(POLLUTING_TEXT, 5, "adult");

  for (const key of [
    "number",
    "address",
    "furigana",
    "name",
    "birthday",
    "childFurigana",
    "childName",
    "childBirthday",
    "disabilityType",
    "issueDate",
    "cityName",
    "issuerAddress",
  ]) {
    assert.equal(typeof result[key], "string", key);
    assert.equal(result[key], "", key);
  }
});

test("安全fallback: 許可リストは現在すべて空（どの種別・ページでも緩い抽出を使わない）", () => {
  for (const certType of CERT_TYPES) {
    for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
      assert.equal(
        isFallbackAllowed(certType.id, pageIndex),
        false,
        `${certType.id} / pageIndex=${pageIndex}`
      );
    }
  }
});

// --- parser registry の回帰テスト ---

test("registry: adult のページ1〜4は従来と同じ専用パーサへ解決される", () => {
  assert.equal(getCertPageParser("adult", 0), parseAdultPage1);
  assert.equal(getCertPageParser("adult", 1), parseAdultPage2);
  assert.equal(getCertPageParser("adult", 2), parseAdultPage3);
  assert.equal(getCertPageParser("adult", 3), parseAdultPage4);
});

test("registry: 未実装ページが別ページのパーサへ解決されない", () => {
  for (const pageIndex of [4, 5, 6, 7]) {
    assert.equal(
      getCertPageParser("adult", pageIndex),
      null,
      `adult / pageIndex=${pageIndex}`
    );
  }
});

test("registry: child の未実装ページが adult のパーサへ暗黙的に流れない", () => {
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    assert.equal(
      getCertPageParser("child", pageIndex),
      null,
      `child / pageIndex=${pageIndex}`
    );
  }
});

test("registry: pageIndex は0始まり（ページ1が index 0 に対応する）", () => {
  // 1始まりに読み替えられていないことを、専用パーサの登録位置で確認する。
  assert.equal(getCertPageParser("adult", 0), parseAdultPage1);
  assert.notEqual(getCertPageParser("adult", 1), parseAdultPage1);
});

// 【仕様変更に伴い更新したテスト】
// child は選択可能になったが、専用パーサはまだ実装していない。
// 有効化後こそ「パーサ未実装でも人物フィールドを汚染しない」ことが重要になるため、
// enabled と parser 未登録の両方をこのテストで固定する。
test("child は選択可能（enabled = true）だが、専用パーサは未実装のまま", () => {
  const child = CERT_TYPES.find((type) => type.id === "child");

  assert.ok(child, "child 種別が定義されていること");
  assert.equal(child.enabled, true);

  // 有効化しても parser registry は変わっていない
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    assert.equal(
      getCertPageParser("child", pageIndex),
      null,
      `child / pageIndex=${pageIndex} に専用パーサが登録されている`
    );
  }

  // そのため取込時は安全な空フォームが返り、人物フィールドは埋まらない
  assertNoPersonData(
    parseCertText(POLLUTING_TEXT, 0, "child"),
    "child 有効化後の page1"
  );
});
