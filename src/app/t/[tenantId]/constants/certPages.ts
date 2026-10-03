import type { CertPage, FormDataType } from "../types/cert";
import { TSUSHO_PAGE_DEFINITIONS } from "../../../../lib/tsusho/constants.ts";

// 障害福祉サービス受給者証（mobility / adult / child）のページ数。
// 種別が分かっている場所では getPageCount(certType) を使うこと。
// この定数は、種別が不明・未知の旧データを表示するときの既定値（互換のための fallback）。
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
  // Phase 1-B3 で内部に登録（非公開）、Phase 1-B4 で7ページ化、Phase 1-B5 で保存に対応。
  // Phase 1-B6 で管理Webにだけ公開する。LINE（lineEnabled）はまだ公開しない。
  // 用紙の色は公式に定めが無いため、colorName は色名ではなく名称で示す。
  {
    id: "tsusho",
    label: "通所受給者証",
    shortLabel: "通所受給者証",
    colorName: "通所受給者証",
    themeClass: "cert-type-tsusho",
    enabled: true,
    lineEnabled: false,
    adminVisible: true,
    statusLabel: "",
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
// tsusho は7ページ（ページ数は getPageCount で種別ごとに求める）。
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

/**
 * 受給者証種別のページ数（mobility / adult / child = 8、tsusho = 7）。
 * ページ定義の件数を正本とし、7・8 を別に持たない。
 * 種別が無い・未知の旧データは、従来どおり 8 ページ（PAGE_COUNT）として扱う。
 */
export function getPageCount(certType: string | null | undefined): number {
  const defs =
    certType && Object.prototype.hasOwnProperty.call(PAGE_DEFINITIONS_BY_CERT_TYPE, certType)
      ? PAGE_DEFINITIONS_BY_CERT_TYPE[certType as CertTypeId]
      : undefined;
  return defs ? defs.length : PAGE_COUNT;
}

// ページタブのサムネイルに使う見本画像（public/cert-samples/{certType}/page-N.png）がある種別。
// tsusho は非PIIの見本画像がリポジトリに無いため含めない（存在しない画像を参照して 404 にしない）。
const CERT_TYPES_WITH_SAMPLE_IMAGES: readonly string[] = ["mobility", "adult", "child"];

/**
 * ページタブのサムネイルに使う見本画像のパス。見本画像が無い種別・範囲外のページは null
 * （呼び出し側は画像の代わりに「見本画像なし」を表示する）。
 */
export function getSampleImagePath(
  certType: string | null | undefined,
  pageIndex: number
): string | null {
  if (!certType || !CERT_TYPES_WITH_SAMPLE_IMAGES.includes(certType)) return null;
  if (!isValidPageIndex(certType, pageIndex)) return null;
  return `/cert-samples/${certType}/page-${pageIndex + 1}.png`;
}

/** その種別で有効なページ番号（0始まり）か */
export function isValidPageIndex(certType: string | null | undefined, pageIndex: number): boolean {
  return Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < getPageCount(certType);
}

/** 取込用の空ページを、その種別のページ数だけ作る */
export function createEmptyPages(certType: string | null | undefined): CertPage[] {
  return Array.from({ length: getPageCount(certType) }, () => createEmptyPage());
}

// 帳票の様式の系統。同じ系統の種別どうし（adult ⇔ child 等）は、ページ構成も
// formData のキーの意味も同じ（name＝支給決定障害者等）。
// tsusho は別の様式（7ページ・name＝児童）のため別の系統。
function certFormFamily(certType: string | null | undefined): "tsusho" | "welfareService" {
  return certType === "tsusho" ? "tsusho" : "welfareService";
}

/**
 * 取込中に種別を切り替えたとき、未保存の取込内容（画像・OCR結果・入力）を破棄して
 * その種別のページ数で作り直す必要があるか。
 * 様式の系統が変わる場合（ページ数・キーの意味が変わる）だけ true。
 * adult ⇔ child の切り替えは従来どおり取込内容を保持する（既存の挙動を変えない）。
 */
export function shouldResetPagesOnCertTypeChange(
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  if (from === to) return false;
  return (
    certFormFamily(from) !== certFormFamily(to) || getPageCount(from) !== getPageCount(to)
  );
}

/** 未保存の取込内容（画像・OCR結果・入力）があるか */
export function hasImportWork(
  pages: readonly { selectedFile?: unknown; ocrText?: string; formData: Record<string, unknown> }[]
): boolean {
  return pages.some(
    (page) => !!page.selectedFile || !!page.ocrText || Object.values(page.formData).some(Boolean)
  );
}

/**
 * 管理Webで既存利用者の「受給者証を更新」を開いたときの、受給者証の種別の初期選択。
 * 戻り値が null なら何もしない（今の選択・取込内容のまま）。
 *
 *   - 現在の受給者証の種別（利用者docの certType。currentCertificateId と同時に更新される）が
 *     管理Webで選択できる種別ならそれ、無い・未知・選択できない種別なら adult
 *   - 次の場合は切り替えない（途中まで行った取込を勝手に消さない）
 *       ・同じ利用者の取込セッションを復元した（スマホ撮影の往復など。復元した種別を優先）
 *       ・利用者の取得を待つ間に、ユーザーが種別を選び直した
 *       ・様式の系統が変わる（8ページ系 ⇔ tsusho）のに、すでに取込内容がある
 *   - 様式の系統が変わる場合は resetPages = true（新しい種別のページ数の空ページで作り直す）
 * LINE には使わない（LINE は色を選ぶ画面で種別を決める。tsusho は LINE で選択できない）。
 */
export function resolveInitialCertTypeForUpdate(params: {
  beneficiaryCertType: string | null | undefined;
  selectedCertType: CertTypeId;
  restoredSessionForSameBeneficiary: boolean;
  userChangedCertType: boolean;
  hasImportWork: boolean;
}): { certType: CertTypeId; resetPages: boolean } | null {
  if (params.restoredSessionForSameBeneficiary || params.userChangedCertType) return null;

  const next: CertTypeId = isCertTypeSelectable(params.beneficiaryCertType, "admin")
    ? (params.beneficiaryCertType as CertTypeId)
    : "adult";
  if (next === params.selectedCertType) return null;

  const resetPages = shouldResetPagesOnCertTypeChange(params.selectedCertType, next);
  if (resetPages && params.hasImportWork) return null;
  return { certType: next, resetPages };
}

/**
 * 種別を切り替えた後の取込ページ。
 * 作り直しが必要なら新しい種別のページ数の空ページ、不要なら元の配列をそのまま返す。
 */
export function pagesAfterCertTypeChange(
  pages: CertPage[],
  from: string | null | undefined,
  to: string | null | undefined
): CertPage[] {
  return shouldResetPagesOnCertTypeChange(from, to) ? createEmptyPages(to) : pages;
}

/**
 * 保存済みの受給者証のページを、その種別のページ数にそろえる（表示・訂正用）。
 * 足りないページは makeEmpty で補い、ページ数を超える分は扱わない。
 * 種別が無い・未知の旧データは 8 ページ。
 */
export function padPagesForCertType<T>(
  pages: readonly T[],
  certType: string | null | undefined,
  makeEmpty: (index: number) => T
): T[] {
  return Array.from({ length: getPageCount(certType) }, (_, index) => {
    const existing = pages[index];
    return existing ? existing : makeEmpty(index);
  });
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