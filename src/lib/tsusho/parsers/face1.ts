// 通所受給者証 一面（基本情報）の parser。
//
// 様式9の並び：受給者証番号 → 通所給付決定保護者（居住地・フリガナ・氏名・生年月日）
//              → 児童（フリガナ・氏名・生年月日）→ 交付年月日 → 支給市町村名及び印
//
// 【最重要】保護者の氏名を name（＝児童）へ入れない。
//  - 「氏名」ラベルをちょうど2つ検出できた場合だけ、1つ目＝保護者、2つ目＝児童として扱う。
//  - 1つしか取れない・3つ以上ある・見出しの位置が様式と矛盾する場合は、
//    guardianName / name / 生年月日 / フリガナ のいずれにも人物の値を入れない（手入力に任せる）。
//  - 縦書きの見出し（「通所給付決定保護者」「児童」）は OCR で欠落しうるため、判定の必須条件にはしない。
//    見出しが読めた場合は、位置が矛盾しないことの確認にだけ使う。
//  - 「とりあえず最初の氏名を name に入れる」フォールバックは持たない。
import type { FormDataType } from "../../../app/t/[tenantId]/types/cert";
import { findEraDate } from "../period.ts";
import {
  collectValueLines,
  findLabelIndexes,
  toFormData,
  toLines,
  type LabelDef,
} from "./helpers.ts";

const L: Record<
  | "title"
  | "number"
  | "guardianHeading"
  | "address"
  | "furigana"
  | "name"
  | "birthday"
  | "childHeading"
  | "issueDate"
  | "city",
  LabelDef
> = {
  title: { key: "title", re: /通所受給者証/ },
  number: { key: "number", re: /受給者証番号/ },
  guardianHeading: { key: "guardianHeading", re: /給付決定保護者/ },
  address: { key: "address", re: /居住地/ },
  furigana: { key: "furigana", re: /フリガナ/ },
  name: { key: "name", re: /氏名/ },
  birthday: { key: "birthday", re: /生年月日/ },
  // 縦書きの「児童」は「童」だけが読まれることがある（様式11での既存調査）。行頭の見出しとしてだけ扱う
  childHeading: { key: "childHeading", re: /^(?:児\s*)?童(?:\s|$)/ },
  issueDate: { key: "issueDate", re: /交付年月日/ },
  city: { key: "city", re: /支給市区?町村名/ },
};

const ALL_LABELS: readonly LabelDef[] = Object.values(L);

// 縦書き見出しの文字が1〜3文字ずつ別の行として読まれたもの（住所に混ぜない）
const VERTICAL_HEADING_NOISE_RE = /^[通所給付決定保護者児童]{1,3}$/;

const TEN_DIGITS_RE = /(?<!\d)\d{10}(?!\d)/;

function firstIndexAfter(indexes: readonly number[], after: number): number | undefined {
  return indexes.find((i) => i > after);
}

/** 人物の氏名として不自然な値（数字だけ・日付）を除く */
function asPersonName(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/^[\d\s-]+$/.test(v.normalize("NFKC"))) return "";
  if (findEraDate(v)) return "";
  return v;
}

function extractNumber(lines: readonly string[], firstPersonLabelIndex: number | undefined): string {
  const numberIdx = findLabelIndexes(lines, L.number)[0];
  let segment: string[];
  if (numberIdx !== undefined) {
    segment = collectValueLines(lines, numberIdx, L.number, ALL_LABELS);
  } else {
    // ラベルが読めない場合は、人物欄より前だけを探す（市町村の電話番号等を拾わない）
    segment = lines.slice(0, firstPersonLabelIndex ?? 0);
  }
  const m = segment.join(" ").normalize("NFKC").match(TEN_DIGITS_RE);
  return m ? m[0] : "";
}

function extractIssueDate(lines: readonly string[]): string {
  const issueIdx = findLabelIndexes(lines, L.issueDate)[0];
  if (issueIdx === undefined) return "";
  const cityIdx = firstIndexAfter(findLabelIndexes(lines, L.city), issueIdx) ?? lines.length;
  return findEraDate(lines.slice(issueIdx, cityIdx).join(" "));
}

function extractCityName(lines: readonly string[]): string {
  const cityIdx = findLabelIndexes(lines, L.city)[0];
  if (cityIdx === undefined) return "";
  const values = collectValueLines(lines, cityIdx, L.city, ALL_LABELS).filter(
    (v) =>
      !/^及/.test(v) && // 「及び 印」「及S 印」等（ラベルの続き）
      !/^印$/.test(v) &&
      !/番号|電話|TEL|記入/i.test(v)
  );
  return values[0] ?? "";
}

type PersonFields = {
  guardianFurigana: string;
  guardianName: string;
  guardianBirthday: string;
  furigana: string;
  name: string;
  birthday: string;
};

const NO_PERSON: PersonFields = {
  guardianFurigana: "",
  guardianName: "",
  guardianBirthday: "",
  furigana: "",
  name: "",
  birthday: "",
};

function extractPersons(lines: readonly string[]): PersonFields {
  const nameIdx = findLabelIndexes(lines, L.name);
  if (nameIdx.length !== 2) return NO_PERSON;
  const [n0, n1] = nameIdx;

  // 見出し・居住地が読めた場合、その位置が様式と矛盾しないことを確かめる
  const childHeadingIdx = findLabelIndexes(lines, L.childHeading);
  if (childHeadingIdx.some((i) => !(i > n0 && i < n1))) return NO_PERSON;
  const guardianHeadingIdx = findLabelIndexes(lines, L.guardianHeading);
  if (guardianHeadingIdx.some((i) => i > n0)) return NO_PERSON;
  const addressIdx = findLabelIndexes(lines, L.address);
  if (addressIdx.some((i) => i > n0)) return NO_PERSON;

  const furiganaIdx = findLabelIndexes(lines, L.furigana);
  const issueIdx = findLabelIndexes(lines, L.issueDate)[0];
  const cityIdx = findLabelIndexes(lines, L.city)[0];

  // 保護者ブロックの終わり：児童のフリガナ／児童見出し／児童の氏名のうち最初のもの
  const guardianEnd = Math.min(
    firstIndexAfter(furiganaIdx, n0) ?? n1,
    firstIndexAfter(childHeadingIdx, n0) ?? n1,
    n1
  );
  // 児童ブロックの終わり：交付年月日／支給市町村名／末尾
  const childEnd = Math.min(
    issueIdx !== undefined && issueIdx > n1 ? issueIdx : lines.length,
    cityIdx !== undefined && cityIdx > n1 ? cityIdx : lines.length
  );

  const guardianName = asPersonName(collectValueLines(lines, n0, L.name, ALL_LABELS, guardianEnd)[0]);
  const name = asPersonName(collectValueLines(lines, n1, L.name, ALL_LABELS, childEnd)[0]);

  const guardianBirthday = findEraDate(lines.slice(n0, guardianEnd).join(" "));
  const birthday = findEraDate(lines.slice(n1, childEnd).join(" "));

  // フリガナはちょうど2つあり、「フリガナ→氏名→フリガナ→氏名」の順に並ぶ場合だけ使う
  let guardianFurigana = "";
  let furigana = "";
  if (furiganaIdx.length === 2) {
    const [f0, f1] = furiganaIdx;
    if (f0 < n0 && n0 < f1 && f1 < n1) {
      guardianFurigana = collectValueLines(lines, f0, L.furigana, ALL_LABELS, n0)[0] ?? "";
      furigana = collectValueLines(lines, f1, L.furigana, ALL_LABELS, n1)[0] ?? "";
    }
  }

  return { guardianFurigana, guardianName, guardianBirthday, furigana, name, birthday };
}

function extractGuardianAddress(lines: readonly string[]): string {
  const addressIdx = findLabelIndexes(lines, L.address);
  if (addressIdx.length !== 1) return "";
  const firstNameIdx = findLabelIndexes(lines, L.name)[0];
  // 居住地は保護者の氏名より前にある（様式どおり）。そうでなければ採用しない
  if (firstNameIdx !== undefined && addressIdx[0] > firstNameIdx) return "";

  return collectValueLines(lines, addressIdx[0], L.address, ALL_LABELS)
    .filter((v) => !VERTICAL_HEADING_NOISE_RE.test(v))
    .join("");
}

/** 一面の OCR テキスト（normalizeText 済み）を formData に変換する */
export function parseTsushoFace1(text: string): FormDataType {
  const lines = toLines(text);
  const firstPersonLabelIndex = Math.min(
    ...[L.address, L.furigana, L.name]
      .map((l) => findLabelIndexes(lines, l)[0])
      .filter((i): i is number => i !== undefined),
    lines.length
  );

  return toFormData({
    number: extractNumber(lines, firstPersonLabelIndex),
    guardianAddress: extractGuardianAddress(lines),
    ...extractPersons(lines),
    issueDate: extractIssueDate(lines),
    cityName: extractCityName(lines),
  });
}
