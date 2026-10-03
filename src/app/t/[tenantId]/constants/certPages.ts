import type { CertPage, FormDataType } from "../types/cert";
import { TSUSHO_PAGE_DEFINITIONS } from "../../../../lib/tsusho/constants.ts";

export const PAGE_COUNT = 8;

// 受給者証の種別。
//   enabled      … 取込で選択できるか（管理Web・LINE共通の「有効」）
//   lineEnabled  … LINEスタッフ版の選択肢に出すか（enabled かつ lineEnabled のときだけ出す）
//   adminVisible … 管理Webの選択肢に表示するか（mobility のように「今後実装予定」として
//                  押せない状態で見せる種別もあるため、enabled とは別に持つ）
// 画面側は CERT_TYPES を直接 map せず、adminCertTypeOptions / lineCertTypeOptions を使うこと。
export const CERT_TYPES = [
  {
    id: "mobility",
    label: "移動支援・地域活動支援 受給者証",
    shortLabel: "移動支援・地域活動支援 受給者証",
    colorName: "クリーム色の受給者証",
    themeClass: "cert-type-cream",
    enabled: false,
    lineEnabled: false,
    adminVisible: true,
    statusLabel: "今後実装予定",
  },
  {
    id: "adult",
    label: "障害福祉サービス受給者証（18歳以上）",
    shortLabel: "障害福祉サービス受給者証（18歳以上）",
    colorName: "紫色の受給者証",
    themeClass: "cert-type-purple",
    enabled: true,
    lineEnabled: true,
    adminVisible: true,
    statusLabel: "",
  },
  {
    id: "child",
    label: "障害福祉サービス受給者証（18歳未満）",
    shortLabel: "障害福祉サービス受給者証（18歳未満）",
    colorName: "黄緑色の受給者証",
    themeClass: "cert-type-green",
    enabled: true,
    lineEnabled: true,
    adminVisible: true,
    statusLabel: "",
  },
  // 通所受給者証（児童福祉法・こども家庭庁 様式第9号）。child（障害福祉サービス受給者証・18歳未満）とは別の証。
  // Phase 1-B3 では内部にだけ登録し、管理Web・LINE のどちらにも表示しない（hidden integration）。
  // 7ページ構成・ページ数の種別化（getPageCount）は Phase 1-B4 で画面へ接続する。
  {
    id: "tsusho",
    label: "通所受給者証",
    shortLabel: "通所受給者証",
    colorName: "通所受給者証",
    themeClass: "",
    enabled: false,
    lineEnabled: false,
    adminVisible: false,
    statusLabel: "準備中",
  },
] as const;

export type CertTypeId = (typeof CERT_TYPES)[number]["id"];

export type CertTypeDefinition = (typeof CERT_TYPES)[number];

/** 管理Webの「受給者証の種類」に表示する種別（押せるかどうかは enabled で判断する） */
export function adminCertTypeOptions(): readonly CertTypeDefinition[] {
  return CERT_TYPES.filter((type) => type.adminVisible);
}

/** LINEスタッフ版の種別選択に表示する種別（選択可能なものだけ） */
export function lineCertTypeOptions(): readonly CertTypeDefinition[] {
  return CERT_TYPES.filter((type) => type.enabled && type.lineEnabled);
}

/** 取込でその種別を選択できるか（管理Web／LINE） */
export function isCertTypeSelectable(
  certType: string | null | undefined,
  variant: "admin" | "line"
): boolean {
  const type = CERT_TYPES.find((t) => t.id === certType);
  if (!type || !type.enabled) return false;
  return variant === "line" ? type.lineEnabled : type.adminVisible;
}

export const PAGE_DEFINITIONS = [
  {
    pageNo: 1,
    title: "障害福祉サービス受給者証（Ⅰ）",
    shortTitle: "受給者証（Ⅰ）",
    sampleImagePath: "/cert-samples/page-1.png",
  },
  {
    pageNo: 2,
    title: "介護給付費の支給決定内容①",
    shortTitle: "介護給付①",
    sampleImagePath: "/cert-samples/page-2.png",
  },
  {
    pageNo: 3,
    title: "介護給付費の支給決定内容②",
    shortTitle: "介護給付②",
    sampleImagePath: "/cert-samples/page-3.png",
  },
  {
    pageNo: 4,
    title: "訓練等給付費の支給決定内容",
    shortTitle: "訓練等給付",
    sampleImagePath: "/cert-samples/page-4.png",
  },
  {
    pageNo: 5,
    title: "障害福祉サービス受給者証（Ⅱ）",
    shortTitle: "受給者証（Ⅱ）",
    sampleImagePath: "/cert-samples/page-5.png",
  },
  {
    pageNo: 6,
    title: "計画相談支援給付費の支給内容",
    shortTitle: "相談支援",
    sampleImagePath: "/cert-samples/page-6.png",
  },
  {
    pageNo: 7,
    title: "利用者負担に関する事項①",
    shortTitle: "利用者負担①",
    sampleImagePath: "/cert-samples/page-7.png",
  },
  {
    pageNo: 8,
    title: "利用者負担に関する事項②",
    shortTitle: "利用者負担②",
    sampleImagePath: "/cert-samples/page-8.png",
  },
] as const;

export const PAGE_TITLES = PAGE_DEFINITIONS.map((page) => page.title);

// 1ページ分の定義。通所受給者証（7ページ・別様式）も同じ形で持てるよう、構造で定義する。
export type PageDefinition = {
  pageNo: number;
  title: string;
  shortTitle: string;
  sampleImagePath?: string;
};

// 通所受給者証（様式第9号）の7ページ。正本は src/lib/tsusho/constants.ts。
// 八・九面（注意事項）は撮影対象外のため含めない。
const TSUSHO_PAGES: readonly PageDefinition[] = TSUSHO_PAGE_DEFINITIONS.map((def) => ({
  pageNo: def.pageNo,
  title: def.title,
  shortTitle: def.shortTitle,
}));

// 受給者証種別ごとのページ構成。
// mobility / adult / child は同一の様式（public/cert-samples/ の各画像を確認した結果、
// 18歳未満＝黄緑色の様式は18歳以上＝紫色と色以外ほぼ同一）のため同じ定義を参照する。
// 種別ごとに様式が異なることが判明した時点で、ここだけを差し替えれば
// 呼び出し側（取込画面・編集画面・ページタブ）に手を入れずに対応できる。
// tsusho は7ページ。ただし Phase 1-B3 時点では画面のページ数（PAGE_COUNT = 8）は変えていない。
const PAGE_DEFINITIONS_BY_CERT_TYPE: Record<
  CertTypeId,
  readonly PageDefinition[]
> = {
  mobility: PAGE_DEFINITIONS,
  adult: PAGE_DEFINITIONS,
  child: PAGE_DEFINITIONS,
  tsusho: TSUSHO_PAGES,
};

export function getPageDefinitions(
  certType: CertTypeId
): readonly PageDefinition[] {
  return PAGE_DEFINITIONS_BY_CERT_TYPE[certType] ?? PAGE_DEFINITIONS;
}

export function getPageTitle(certType: CertTypeId, pageIndex: number): string {
  return (
    getPageDefinitions(certType)[pageIndex]?.title || `ページ ${pageIndex + 1}`
  );
}

export const emptyFormData = (): FormDataType => ({
  number: "",

  address: "",
  furigana: "",

  name: "",
  birthday: "",

  childFurigana: "",
  childName: "",
  childBirthday: "",

  disabilityType: "",
  issueDate: "",

  cityName: "",
  issuerAddress: "",

  certPeriod: "",

  serviceType1: "",
  servicePeriod1: "",
  serviceAmount1: "",

  serviceType2: "",
  servicePeriod2: "",
  serviceAmount2: "",

  serviceType3: "",
  servicePeriod3: "",
  serviceAmount3: "",

  serviceType4: "",
  servicePeriod4: "",
  serviceAmount4: "",

  serviceType5: "",
  servicePeriod5: "",
  serviceAmount5: "",

  serviceType6: "",
  servicePeriod6: "",
  serviceAmount6: "",

  serviceType7: "",
  servicePeriod7: "",
  serviceAmount7: "",

  serviceType8: "",
  servicePeriod8: "",
  serviceAmount8: "",

  supportPeriod: "",
  planOfficeName: "",
  monitoringPeriod: "",
  planStartDate: "",
  specialPaymentAmount: "",
  specialPaymentPeriod: "",
  specialPaymentPrevAmount: "",
  specialPaymentPrevPeriod: "",

  burdenLimitAmount: "",
  burdenPeriod: "",
  burdenLimitAmountPrev: "",
  burdenPeriodPrev: "",
  mealProvisionStatus: "",
  managementTargetStatus: "",
  managementOfficeName: "",
  startDate: "",
  specialNotes: "",
  contactInfo: "",

  memo: "",
});

export const createEmptyPage = (): CertPage => ({
  selectedFile: null,
  previewUrl: "",
  ocrText: "",
  formData: emptyFormData(),
  storagePath: "",
});