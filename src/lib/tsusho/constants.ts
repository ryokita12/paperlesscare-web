// 通所受給者証のページ定義・formData キー（純粋データ）。
//
// 根拠：こども家庭庁 様式第9号 通所受給者証（例）。全9面のうち、
//   一〜五面 … OCR 対象
//   六・七面 … 障害児通所支援事業者記入欄（画像保存＋手入力。OCR 対象外）
//   八・九面 … 注意事項（定型文。撮影対象外のためページに含めない）
//
// Phase 1-B1 時点では CERT_TYPES / PAGE_DEFINITIONS_BY_CERT_TYPE / PAGE_COUNT には登録しない。
import type { TsushoServiceRow } from "./types.ts";

export const TSUSHO_CERT_TYPE = "tsusho" as const;

export const TSUSHO_PAGE_COUNT = 7;

export type TsushoPageDefinition = {
  pageNo: number;
  face: string;
  title: string;
  shortTitle: string;
  ocr: boolean;
  /** このページの formData で扱うキー */
  fields: readonly string[];
};

/** 一面：通所受給者証（基本情報） */
export const TSUSHO_FACE1_FIELDS = [
  "number",
  "guardianAddress",
  "guardianFurigana",
  "guardianName",
  "guardianBirthday",
  "furigana",
  "name",
  "birthday",
  "issueDate",
  "cityName",
] as const;

/** 二面：給付決定内容（1・2行目）。特記事項・予備欄は三面・五面と区別できるキーにする */
export const TSUSHO_FACE2_FIELDS = [
  "serviceType1",
  "serviceAmount1",
  "servicePeriod1",
  "serviceType2",
  "serviceAmount2",
  "servicePeriod2",
  "decision2SpecialNotes",
  "decision2Memo",
  // 自治体の工夫で1面に3行以上ある場合の3行目以降（原文）
  "decision2ExtraRows",
] as const;

/** 三面：給付決定内容（3・4行目） */
export const TSUSHO_FACE3_FIELDS = [
  "serviceType3",
  "serviceAmount3",
  "servicePeriod3",
  "serviceType4",
  "serviceAmount4",
  "servicePeriod4",
  "decision3SpecialNotes",
  "decision3Memo",
  "decision3ExtraRows",
] as const;

/** 四面：障害児相談支援給付費の支給内容 */
export const TSUSHO_FACE4_FIELDS = [
  "supportPeriod",
  "planOfficeName",
  "monitoringPeriod",
  "consultationMemo",
] as const;

/** 五面：利用者負担に関する事項 */
export const TSUSHO_FACE5_FIELDS = [
  "burdenLimitAmount",
  "burdenPeriod",
  "mealProvisionStatus",
  "mealProvisionPeriod",
  "managementTargetStatus",
  "managementOfficeName",
  "burdenSpecialNotes",
  "burdenMemo",
] as const;

// 六・七面（事業者記入欄）は Phase 1-B1/B2 の対象外。キーは将来
// providerNameN / providerServiceN / providerContractAmountN / providerContractDateN /
// providerEndDateN / providerProvidedAmountN（N=1〜6）を想定しているが、ここでは定義しない。

export const TSUSHO_PAGE_DEFINITIONS: readonly TsushoPageDefinition[] = [
  { pageNo: 1, face: "一", title: "通所受給者証（一面）", shortTitle: "一面 基本情報", ocr: true, fields: TSUSHO_FACE1_FIELDS },
  { pageNo: 2, face: "二", title: "障害児通所給付費の給付決定内容（二面）", shortTitle: "二面 給付決定①", ocr: true, fields: TSUSHO_FACE2_FIELDS },
  { pageNo: 3, face: "三", title: "障害児通所給付費の給付決定内容（三面）", shortTitle: "三面 給付決定②", ocr: true, fields: TSUSHO_FACE3_FIELDS },
  { pageNo: 4, face: "四", title: "障害児相談支援給付費の支給内容（四面）", shortTitle: "四面 相談支援", ocr: true, fields: TSUSHO_FACE4_FIELDS },
  { pageNo: 5, face: "五", title: "利用者負担に関する事項（五面）", shortTitle: "五面 利用者負担", ocr: true, fields: TSUSHO_FACE5_FIELDS },
  { pageNo: 6, face: "六", title: "障害児通所支援事業者記入欄（六面）", shortTitle: "六面 事業者①", ocr: false, fields: [] },
  { pageNo: 7, face: "七", title: "障害児通所支援事業者記入欄（七面）", shortTitle: "七面 事業者②", ocr: false, fields: [] },
];

/** 給付決定内容の行と、それが載るページ・formData キーの対応 */
export const TSUSHO_SERVICE_ROWS: readonly {
  row: TsushoServiceRow;
  pageNo: 2 | 3;
  typeKey: string;
  amountKey: string;
  periodKey: string;
}[] = [
  { row: 1, pageNo: 2, typeKey: "serviceType1", amountKey: "serviceAmount1", periodKey: "servicePeriod1" },
  { row: 2, pageNo: 2, typeKey: "serviceType2", amountKey: "serviceAmount2", periodKey: "servicePeriod2" },
  { row: 3, pageNo: 3, typeKey: "serviceType3", amountKey: "serviceAmount3", periodKey: "servicePeriod3" },
  { row: 4, pageNo: 3, typeKey: "serviceType4", amountKey: "serviceAmount4", periodKey: "servicePeriod4" },
];
