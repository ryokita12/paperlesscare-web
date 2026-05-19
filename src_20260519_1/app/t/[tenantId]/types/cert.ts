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
};

export type CertPage = {
  selectedFile: File | null;
  previewUrl: string;
  ocrText: string;
  formData: FormDataType;
};