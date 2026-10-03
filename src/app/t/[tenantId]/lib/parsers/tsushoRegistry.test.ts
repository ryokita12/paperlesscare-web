// Phase 1-B3：parser 基盤（CERT_PAGE_PARSERS / parseCertText）への通所受給者証の登録を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCertPageParser, parseCertText } from "./parseCertText.ts";
import { parseAdultPage1 } from "./adult/page1.ts";
import { parseAdultPage2 } from "./adult/page2.ts";
import { parseAdultPage3 } from "./adult/page3.ts";
import { parseAdultPage4 } from "./adult/page4.ts";
import {
  parseTsushoCertText,
  TSUSHO_PAGE_PARSERS,
} from "../../../../../lib/tsusho/parsers/index.ts";
import {
  FACE1_SINGLE_NAME_BLOCK,
  FACE1_STANDARD,
  FACE2_JIDO_AND_HOUKAGO,
  FACE4_STANDARD,
  FACE5_STANDARD,
} from "../../../../../lib/tsusho/parsers/fixtures.ts";

test("E：tsusho の一〜五面（index 0〜4）は Phase 1-B2 の parser に接続されている", () => {
  for (const pageIndex of [0, 1, 2, 3, 4]) {
    const parser = getCertPageParser("tsusho", pageIndex);
    assert.ok(parser, `pageIndex=${pageIndex}`);
    assert.equal(parser, TSUSHO_PAGE_PARSERS[pageIndex], `pageIndex=${pageIndex}`);
  }
});

test("E：tsusho の六・七面（index 5・6）と範囲外は parser なし", () => {
  for (const pageIndex of [5, 6, 7, -1, 99]) {
    assert.equal(getCertPageParser("tsusho", pageIndex), null, `pageIndex=${pageIndex}`);
  }
});

test("E：adult の parser は従来どおり、child / mobility は空のまま（tsusho を流用しない）", () => {
  assert.equal(getCertPageParser("adult", 0), parseAdultPage1);
  assert.equal(getCertPageParser("adult", 1), parseAdultPage2);
  assert.equal(getCertPageParser("adult", 2), parseAdultPage3);
  assert.equal(getCertPageParser("adult", 3), parseAdultPage4);
  for (let pageIndex = 4; pageIndex < 8; pageIndex++) {
    assert.equal(getCertPageParser("adult", pageIndex), null, `adult/${pageIndex}`);
  }
  for (const certType of ["child", "mobility"] as const) {
    for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
      assert.equal(getCertPageParser(certType, pageIndex), null, `${certType}/${pageIndex}`);
    }
  }
});

test("parseCertText 経由（certType = tsusho）は parseTsushoCertText と同じ結果（normalizeText を二重に適用しない）", () => {
  const cases: [string, number][] = [
    [FACE1_STANDARD, 0],
    [FACE2_JIDO_AND_HOUKAGO, 1],
    [FACE4_STANDARD, 3],
    [FACE5_STANDARD, 4],
  ];
  for (const [text, pageIndex] of cases) {
    assert.deepEqual(
      parseCertText(text, pageIndex, "tsusho"),
      parseTsushoCertText(text, pageIndex),
      `pageIndex=${pageIndex}`
    );
  }
});

test("F：parseCertText 経由でも保護者と児童を分離し、保護者名を name に入れない", () => {
  const r = parseCertText(FACE1_STANDARD, 0, "tsusho");
  assert.equal(r.guardianName, "架空 太郎");
  assert.equal(r.name, "架空 勇気");
  assert.notEqual(r.name, r.guardianName);
});

test("F：parseCertText 経由でも氏名ブロックが1つなら人物を割り当てない", () => {
  const r = parseCertText(FACE1_SINGLE_NAME_BLOCK, 0, "tsusho");
  assert.equal(r.name, "");
  assert.equal(r.guardianName, "");
});

test("child（障害福祉サービス受給者証・18歳未満）として解析しても tsusho の parser は使われない", () => {
  const r = parseCertText(FACE1_STANDARD, 0, "child");
  assert.equal(r.name, "");
  assert.equal(r.guardianName ?? "", "");
  assert.equal(r.number, "");
});
