"use client";

// 利用者カルテ「契約・関係先」タブ：契約情報・学校／所属・相談支援
import type { User } from "firebase/auth";
import { saveChartSection, type BeneficiaryChart } from "@/lib/beneficiaryChart/chartStore";
import { calcSchoolGrade, formatJapaneseDate } from "@/lib/beneficiaryChart/dates";
import {
  CONTRACT_STATUS_OPTIONS,
  validateConsultationSupport,
  validateContract,
  type BeneficiaryConsultationSupport,
  type BeneficiaryContract,
  type BeneficiarySchool,
  type ChartIdentity,
  type ContractStatus,
} from "@/lib/beneficiaryChart/model";
import {
  DisplayValue,
  FormField,
  FormGrid,
  InfoGrid,
  InfoItem,
  inputClass,
  SectionCard,
} from "../../components/chartUi";
import { useSectionEditor, type SectionEditorControl } from "./useSectionEditor";
import { GradeInput } from "./GradeInput";

type Props = {
  tenantId: string;
  chart: BeneficiaryChart;
  identity: ChartIdentity;
  today: Date;
  user: User;
  control: SectionEditorControl;
  onSaved: () => Promise<void>;
};

function contractStatusLabel(value: string): string {
  return CONTRACT_STATUS_OPTIONS.find((o) => o.id === value)?.label ?? "";
}

export default function ContractTab({ tenantId, chart, identity, today, user, control, onSaved }: Props) {
  const { record, sections } = chart;
  const beneficiaryId = record.id;

  const contract = useSectionEditor<BeneficiaryContract>({
    id: "contract",
    control,
    initial: () => sections.contract,
    validate: validateContract,
    save: async (value) => {
      await saveChartSection({ tenantId, beneficiaryId, key: "contract", value, user });
      await onSaved();
    },
  });

  const school = useSectionEditor<BeneficiarySchool>({
    id: "school",
    control,
    initial: () => sections.school,
    validate: () => ({}),
    save: async (value) => {
      await saveChartSection({ tenantId, beneficiaryId, key: "school", value, user });
      await onSaved();
    },
  });

  const consultation = useSectionEditor<BeneficiaryConsultationSupport>({
    id: "consultationSupport",
    control,
    initial: () => sections.consultationSupport,
    validate: validateConsultationSupport,
    save: async (value) => {
      await saveChartSection({ tenantId, beneficiaryId, key: "consultationSupport", value, user });
      await onSaved();
    },
  });

  const c = contract.draft;
  const s = school.draft;
  const cs = consultation.draft;
  const autoGrade = calcSchoolGrade(identity.birthDate, today)?.label ?? "";

  return (
    <div className="space-y-4">
      <SectionCard
        title="契約情報"
        editing={contract.editing}
        canEdit={contract.canEdit}
        onEdit={contract.start}
        onCancel={contract.cancel}
        onSave={() => void contract.submit()}
        saving={contract.saving}
        message={contract.message}
      >
        {contract.editing ? (
          <FormGrid>
            <FormField label="契約状態" htmlFor="c-status">
              <select
                id="c-status"
                className={inputClass}
                value={c.contractStatus}
                onChange={(e) => contract.setField("contractStatus", e.target.value as ContractStatus | "")}
              >
                <option value="">未設定</option>
                {CONTRACT_STATUS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="契約日" htmlFor="c-date" error={contract.errors.contractDate}>
              <input id="c-date" type="date" className={inputClass} value={c.contractDate} onChange={(e) => contract.setField("contractDate", e.target.value)} />
            </FormField>
            <FormField label="利用開始日" htmlFor="c-start" error={contract.errors.startDate}>
              <input id="c-start" type="date" className={inputClass} value={c.startDate} onChange={(e) => contract.setField("startDate", e.target.value)} />
            </FormField>
            <FormField label="契約終了日" htmlFor="c-end" error={contract.errors.endDate}>
              <input id="c-end" type="date" className={inputClass} value={c.endDate} onChange={(e) => contract.setField("endDate", e.target.value)} />
            </FormField>
            <FormField label="契約支給量" htmlFor="c-amount" hint="例：月23日">
              <input id="c-amount" className={inputClass} value={c.contractedAmount} onChange={(e) => contract.setField("contractedAmount", e.target.value)} />
            </FormField>
            <FormField label="事業者記入欄番号" htmlFor="c-entry" hint="受給者証の事業者記入欄の番号">
              <input id="c-entry" className={inputClass} value={c.providerEntryNumber} onChange={(e) => contract.setField("providerEntryNumber", e.target.value)} />
            </FormField>
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoItem label="契約状態">
              <DisplayValue value={contractStatusLabel(sections.contract.contractStatus)} empty="未設定" />
            </InfoItem>
            <InfoItem label="契約日">
              <DisplayValue value={formatJapaneseDate(sections.contract.contractDate)} />
            </InfoItem>
            <InfoItem label="利用開始日">
              <DisplayValue value={formatJapaneseDate(sections.contract.startDate)} />
            </InfoItem>
            <InfoItem label="契約終了日">
              <DisplayValue value={formatJapaneseDate(sections.contract.endDate)} />
            </InfoItem>
            <InfoItem label="契約支給量">
              <DisplayValue value={sections.contract.contractedAmount} />
            </InfoItem>
            <InfoItem label="事業者記入欄番号">
              <DisplayValue value={sections.contract.providerEntryNumber} />
            </InfoItem>
          </InfoGrid>
        )}
      </SectionCard>

      <SectionCard
        title="学校・所属"
        editing={school.editing}
        canEdit={school.canEdit}
        onEdit={school.start}
        onCancel={school.cancel}
        onSave={() => void school.submit()}
        saving={school.saving}
        message={school.message}
      >
        {school.editing ? (
          <FormGrid>
            <FormField label="学校名" htmlFor="s-name">
              <input id="s-name" className={inputClass} value={s.schoolName} onChange={(e) => school.setField("schoolName", e.target.value)} placeholder="〇〇市立〇〇小学校" />
            </FormField>
            <GradeInput id="s-grade" value={s.grade} autoGrade={autoGrade} onChange={(v) => school.setField("grade", v)} />
            <FormField label="クラス" htmlFor="s-class">
              <input id="s-class" className={inputClass} value={s.className} onChange={(e) => school.setField("className", e.target.value)} placeholder="2組／ひまわり学級" />
            </FormField>
            <FormField label="担任名" htmlFor="s-teacher">
              <input id="s-teacher" className={inputClass} value={s.teacherName} onChange={(e) => school.setField("teacherName", e.target.value)} />
            </FormField>
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoItem label="学校名">
              <DisplayValue value={sections.school.schoolName} />
            </InfoItem>
            <InfoItem label="学年">
              <DisplayValue value={identity.grade} />
              {identity.gradeSource !== "none" && (
                <span className="ml-2 text-xs text-zinc-500">
                  {identity.gradeSource === "manual" ? "（手動で設定）" : "（生年月日から自動計算）"}
                </span>
              )}
            </InfoItem>
            <InfoItem label="クラス">
              <DisplayValue value={sections.school.className} />
            </InfoItem>
            <InfoItem label="担任名">
              <DisplayValue value={sections.school.teacherName} />
            </InfoItem>
          </InfoGrid>
        )}
      </SectionCard>

      <SectionCard
        title="相談支援"
        editing={consultation.editing}
        canEdit={consultation.canEdit}
        onEdit={consultation.start}
        onCancel={consultation.cancel}
        onSave={() => void consultation.submit()}
        saving={consultation.saving}
        message={consultation.message}
      >
        {consultation.editing ? (
          <FormGrid>
            <FormField label="相談支援事業所" htmlFor="cs-office">
              <input id="cs-office" className={inputClass} value={cs.officeName} onChange={(e) => consultation.setField("officeName", e.target.value)} />
            </FormField>
            <FormField label="相談支援専門員" htmlFor="cs-specialist">
              <input id="cs-specialist" className={inputClass} value={cs.specialistName} onChange={(e) => consultation.setField("specialistName", e.target.value)} />
            </FormField>
            <FormField label="電話番号" htmlFor="cs-phone" error={consultation.errors.phone}>
              <input id="cs-phone" className={inputClass} inputMode="tel" value={cs.phone} onChange={(e) => consultation.setField("phone", e.target.value)} />
            </FormField>
            <FormField label="メールアドレス" htmlFor="cs-email" error={consultation.errors.email}>
              <input id="cs-email" type="email" className={inputClass} value={cs.email} onChange={(e) => consultation.setField("email", e.target.value)} />
            </FormField>
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoItem label="相談支援事業所">
              <DisplayValue value={sections.consultationSupport.officeName} />
            </InfoItem>
            <InfoItem label="相談支援専門員">
              <DisplayValue value={sections.consultationSupport.specialistName} />
            </InfoItem>
            <InfoItem label="電話番号">
              <DisplayValue value={sections.consultationSupport.phone} />
            </InfoItem>
            <InfoItem label="メールアドレス">
              <DisplayValue value={sections.consultationSupport.email} />
            </InfoItem>
          </InfoGrid>
        )}
      </SectionCard>
    </div>
  );
}
