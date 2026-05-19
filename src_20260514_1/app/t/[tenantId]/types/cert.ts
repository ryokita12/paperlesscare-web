export type FormDataType = {
  number: string;
  address: string;
  name: string;
  birthday: string;
  childName: string;
  childBirthday: string;
  disabilityType: string;
  issueDate: string;
  cityName: string;
};

export type CertPage = {
  selectedFile: File | null;
  previewUrl: string;
  ocrText: string;
  formData: FormDataType;
};