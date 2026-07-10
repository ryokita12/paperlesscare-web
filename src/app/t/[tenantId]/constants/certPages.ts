import type { CertPage, FormDataType } from "../types/cert";

export const PAGE_COUNT = 8;

export const CERT_TYPES = [
  {
    id: "mobility",
    label: "移動支援・地域活動支援 受給者証",
    shortLabel: "移動支援・地域活動支援 受給者証",
    colorName: "クリーム色の受給者証",
    themeClass: "cert-type-cream",
    enabled: false,
    statusLabel: "今後実装予定",
  },
  {
    id: "adult",
    label: "障害福祉サービス受給者証（18歳以上）",
    shortLabel: "障害福祉サービス受給者証（18歳以上）",
    colorName: "紫色の受給者証",
    themeClass: "cert-type-purple",
    enabled: true,
    statusLabel: "",
  },
  {
    id: "child",
    label: "障害福祉サービス受給者証（18歳未満）",
    shortLabel: "障害福祉サービス受給者証（18歳未満）",
    colorName: "黄緑色の受給者証",
    themeClass: "cert-type-green",
    enabled: false,
    statusLabel: "今後実装予定",
  },
] as const;

export type CertTypeId = (typeof CERT_TYPES)[number]["id"];

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