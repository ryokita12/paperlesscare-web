// 通所受給者証（児童福祉法・こども家庭庁 様式第9号）の型定義。
//
// Phase 1-B1 時点では PaperlessCare 本体のどこからも参照されない（未接続）。
// 既存の受給者証種別（adult / child＝障害福祉サービス受給者証）とは独立に扱う。
//
// formData のキーの意味（tsusho のみ。adult / child とは意味が異なるキーがある点に注意）：
//   name / furigana / birthday                   … 児童（＝利用者本人）
//   guardianName / guardianFurigana /
//   guardianBirthday / guardianAddress          … 通所給付決定保護者（居住地は保護者の欄）
// adult / child では name 等は「支給決定障害者等」を指すため、ここでの意味づけを
// adult / child へ持ち込まないこと。

/** 障害児通所支援の種類（CFA要領 Ⅳ-4(2)(ｱ) の4区分）。判定できないものは unknown */
export type TsushoServiceKind =
  | "jidoHattatsu" // 児童発達支援
  | "houkagoDay" // 放課後等デイサービス
  | "kyotakuHoumon" // 居宅訪問型児童発達支援
  | "hoikushoHoumon" // 保育所等訪問支援
  | "unknown";

/** 二面（1・2行目）・三面（3・4行目）の行番号 */
export type TsushoServiceRow = 1 | 2 | 3 | 4;

/**
 * 給付決定内容の1行。pages の formData から毎回生成する派生データで、保存しない。
 */
export type TsushoServiceDecision = {
  row: TsushoServiceRow;
  kind: TsushoServiceKind;
  /** 証の記載どおりの「支援の種類」 */
  kindText: string;
  /** 「支給量等」の原文（加算・変更年月日などを含みうる） */
  amountText: string;
  /** 「23日／月」のように1か所だけ安全に読めた場合のみ。それ以外は null */
  daysPerMonth: number | null;
  /** 「給付決定期間」の記載 */
  periodText: string;
  /** 給付決定期間の開始日・終了日（"YYYY-MM-DD"）。読めなければ null */
  validFrom: string | null;
  validTo: string | null;
};

/** 代表給付決定期間（一覧の期限管理に使う想定）。根拠の行を UI で表示できるように持つ */
export type TsushoRepresentativeValidity = {
  validFrom: string | null;
  validTo: string;
  row: TsushoServiceRow;
  serviceKind: TsushoServiceKind;
  serviceKindText: string;
  periodText: string;
};

/** pages の要素として受け付ける最小の形（SavedCertPage / CertPage のどちらも満たす） */
export type TsushoPageLike = {
  pageNo?: number;
  formData?: Readonly<Record<string, string | undefined>>;
};
