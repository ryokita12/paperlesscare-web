import type { CertPage, FormDataType } from "../types/cert";

export const PAGE_COUNT = 8;

export const PAGE_TITLES = [
  "障害福祉サービス受給者証（Ⅰ）",
  "介護給付費の支給決定内容①",
  "介護給付費の支給決定内容②",
  "訓練等給付費の支給決定内容",
  "障害福祉サービス受給者証（Ⅱ）",
  "計画相談支援給付費の支給内容",
  "利用者負担に関する事項①",
  "利用者負担に関する事項②",
] as const;

export const emptyFormData = (): FormDataType => ({
  number: "",
  address: "",
  name: "",
  birthday: "",
  childName: "",
  childBirthday: "",
  disabilityType: "",
  issueDate: "",
  cityName: "",
});

export const createEmptyPage = (): CertPage => ({
  selectedFile: null,
  previewUrl: "",
  ocrText: "",
  formData: emptyFormData(),
});