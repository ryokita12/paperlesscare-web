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

  contactInfo?: string;
  memo?: string;
};

export type CertPage = {
  selectedFile: File | null;
  previewUrl: string;
  ocrText: string;
  formData: FormDataType;
};