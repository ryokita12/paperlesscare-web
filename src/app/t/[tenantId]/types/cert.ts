export type FormDataType = Record<string, string> & {
  number: string;
  address: string;
  furigana: string;
  name: string;
  birthday: string;
  childFurigana: string;
  childName: string;
  childBirthday: string;
  disabilityType: string;
  issueDate: string;
  cityName: string;
  issuerAddress: string;

  certPeriod?: string;

  serviceType2?: string;
  servicePeriod2?: string;
  serviceAmount2?: string;

  serviceType3?: string;
  servicePeriod3?: string;
  serviceAmount3?: string;

  serviceType4?: string;
  servicePeriod4?: string;
  serviceAmount4?: string;

  serviceType5?: string;
  servicePeriod5?: string;
  serviceAmount5?: string;

  serviceType6?: string;
  servicePeriod6?: string;
  serviceAmount6?: string;

  serviceType7?: string;
  servicePeriod7?: string;
  serviceAmount7?: string;

  serviceType8?: string;
  servicePeriod8?: string;
  serviceAmount8?: string;

  // ページ6：計画相談支援給付費 / 特定障害者特別給付費
  supportPeriod?: string;
  planOfficeName?: string;
  monitoringPeriod?: string;
  planStartDate?: string;
  specialPaymentAmount?: string;
  specialPaymentPeriod?: string;
  specialPaymentPrevAmount?: string;
  specialPaymentPrevPeriod?: string;

  // ページ7・8：利用者負担に関する事項
  burdenLimitAmount?: string;
  burdenPeriod?: string;
  burdenLimitAmountPrev?: string;
  burdenPeriodPrev?: string;
  mealProvisionStatus?: string;
  managementTargetStatus?: string;
  managementOfficeName?: string;
  startDate?: string;
  specialNotes?: string;

  contactInfo?: string;
  memo?: string;
};

export type CertPage = {
  selectedFile: File | null;
  previewUrl: string;
  ocrText: string;
  formData: FormDataType;
  // Firebase Storage 上のアップロード先パス（Firestore保存時に画像の参照として保持する）
  storagePath: string;
};