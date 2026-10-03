"use client";

// 利用者カルテ「基本情報」タブ：本人情報・保護者情報
import type { User } from "firebase/auth";
import { saveChartPersonal, saveChartSection, type BeneficiaryChart } from "@/lib/beneficiaryChart/chartStore";
import { calcAge, calcSchoolGrade, formatJapaneseDate } from "@/lib/beneficiaryChart/dates";
import {
  initialPersonalForm,
  resolveGuardianAddress,
  USAGE_STATUS_OPTIONS,
  validateGuardian,
  validatePersonal,
  type BeneficiaryGuardian,
  type BeneficiaryPersonal,
  type ChartIdentity,
  type UsageStatus,
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

type PersonalDraft = BeneficiaryPersonal & { grade: string };

const BIRTH_SOURCE_NOTE: Record<ChartIdentity["birthDateSource"], string> = {
  chart: "",
  // 旧データでは profile 自体が受給者証の写しから補われているため、出どころを断定しない文言にする
  profile: "カルテ未登録のため、受給者証・登録時の入力から表示しています。",
  certificate: "カルテ未登録のため、受給者証の記載から表示しています。",
  none: "",
};

function usageLabel(value: string): string {
  return USAGE_STATUS_OPTIONS.find((o) => o.id === value)?.label ?? "";
}

function addressText(postalCode: string, address: string): string {
  return [postalCode && `〒${postalCode}`, address].filter(Boolean).join(" ");
}

export default function BasicInfoTab({ tenantId, chart, identity, today, user, control, onSaved }: Props) {
  const { record, sections } = chart;

  const personal = useSectionEditor<PersonalDraft>({
    id: "personal",
    control,
    initial: () => ({ ...initialPersonalForm(sections, identity), grade: sections.school.grade }),
    validate: (d) => validatePersonal(d, today),
    save: async ({ grade, ...p }) => {
      await saveChartPersonal({ tenantId, record, personal: p, grade, user });
      await onSaved();
    },
  });

  const guardian = useSectionEditor<BeneficiaryGuardian>({
    id: "guardian",
    control,
    initial: () => sections.guardian,
    validate: validateGuardian,
    save: async (g) => {
      await saveChartSection({ tenantId, beneficiaryId: record.id, key: "guardian", value: g, user });
      await onSaved();
    },
  });

  const pd = personal.draft;
  const draftAge = calcAge(pd.birthDate, today);
  const draftAutoGrade = calcSchoolGrade(pd.birthDate, today)?.label ?? "";
  const guardianAddress = resolveGuardianAddress(sections);
  const g = guardian.draft;

  return (
    <div className="space-y-4">
      <SectionCard
        title="本人情報"
        editing={personal.editing}
        canEdit={personal.canEdit}
        onEdit={personal.start}
        onCancel={personal.cancel}
        onSave={() => void personal.submit()}
        saving={personal.saving}
        message={personal.message}
      >
        {personal.editing ? (
          <FormGrid>
            <FormField label="氏名" required htmlFor="p-name" error={personal.errors.name}>
              <input id="p-name" className={inputClass} value={pd.name} onChange={(e) => personal.setField("name", e.target.value)} placeholder="山田 太郎" />
            </FormField>
            <FormField label="フリガナ" htmlFor="p-furigana">
              <input id="p-furigana" className={inputClass} value={pd.furigana} onChange={(e) => personal.setField("furigana", e.target.value)} placeholder="ヤマダ タロウ" />
            </FormField>
            <FormField
              label="生年月日"
              htmlFor="p-birth"
              error={personal.errors.birthDate}
              hint={
                identity.birthDateRawText && !pd.birthDate
                  ? `登録済みの値「${identity.birthDateRawText}」は日付として読み取れませんでした。正しい生年月日を入力してください。`
                  : undefined
              }
            >
              <input id="p-birth" type="date" className={inputClass} value={pd.birthDate} onChange={(e) => personal.setField("birthDate", e.target.value)} />
            </FormField>
            <FormField label="年齢（自動計算）">
              <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                {draftAge === null ? <span className="text-zinc-400">生年月日を入力すると表示されます</span> : `${draftAge}歳`}
              </div>
            </FormField>
            <GradeInput id="p-grade" value={pd.grade} autoGrade={draftAutoGrade} onChange={(v) => personal.setField("grade", v)} />
            <FormField label="利用状態" htmlFor="p-usage">
              <select
                id="p-usage"
                className={inputClass}
                value={pd.usageStatus}
                onChange={(e) => personal.setField("usageStatus", e.target.value as UsageStatus | "")}
              >
                <option value="">未設定</option>
                {USAGE_STATUS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="郵便番号" htmlFor="p-postal" error={personal.errors.postalCode}>
              <input id="p-postal" className={inputClass} inputMode="numeric" value={pd.postalCode} onChange={(e) => personal.setField("postalCode", e.target.value)} placeholder="123-4567" />
            </FormField>
            <FormField label="電話番号" htmlFor="p-phone" error={personal.errors.phone}>
              <input id="p-phone" className={inputClass} inputMode="tel" value={pd.phone} onChange={(e) => personal.setField("phone", e.target.value)} placeholder="052-123-4567" />
            </FormField>
            <FormField label="住所" htmlFor="p-address" wide>
              <input id="p-address" className={inputClass} value={pd.address} onChange={(e) => personal.setField("address", e.target.value)} placeholder="愛知県名古屋市中区…" />
            </FormField>
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoItem label="氏名">
              <DisplayValue value={identity.name} />
            </InfoItem>
            <InfoItem label="フリガナ">
              <DisplayValue value={identity.furigana} />
            </InfoItem>
            <InfoItem label="生年月日">
              {identity.birthDate ? (
                <>
                  {formatJapaneseDate(identity.birthDate)}
                  {BIRTH_SOURCE_NOTE[identity.birthDateSource] && (
                    <div className="text-xs text-zinc-500">{BIRTH_SOURCE_NOTE[identity.birthDateSource]}</div>
                  )}
                </>
              ) : identity.birthDateRawText ? (
                <>
                  {identity.birthDateRawText}
                  <div className="text-xs text-amber-700">日付として読み取れないため、年齢を計算できません。「編集」から生年月日を入力してください。</div>
                </>
              ) : (
                <DisplayValue value="" />
              )}
            </InfoItem>
            <InfoItem label="年齢（自動計算）">
              <DisplayValue value={identity.age === null ? "" : `${identity.age}歳`} empty="—" />
            </InfoItem>
            <InfoItem label="学年">
              <DisplayValue value={identity.grade} />
              {identity.gradeSource !== "none" && (
                <span className="ml-2 text-xs text-zinc-500">
                  {identity.gradeSource === "manual" ? "（手動で設定）" : "（生年月日から自動計算）"}
                </span>
              )}
            </InfoItem>
            <InfoItem label="利用状態">
              <DisplayValue value={usageLabel(sections.personal.usageStatus)} empty="未設定" />
            </InfoItem>
            <InfoItem label="電話番号">
              <DisplayValue value={sections.personal.phone} />
            </InfoItem>
            <InfoItem label="住所" wide>
              <DisplayValue value={addressText(sections.personal.postalCode, sections.personal.address)} />
            </InfoItem>
          </InfoGrid>
        )}
      </SectionCard>

      <SectionCard
        title="保護者情報"
        editing={guardian.editing}
        canEdit={guardian.canEdit}
        onEdit={guardian.start}
        onCancel={guardian.cancel}
        onSave={() => void guardian.submit()}
        saving={guardian.saving}
        message={guardian.message}
      >
        {guardian.editing ? (
          <FormGrid>
            <FormField label="保護者氏名" htmlFor="g-name">
              <input id="g-name" className={inputClass} value={g.name} onChange={(e) => guardian.setField("name", e.target.value)} placeholder="山田 花子" />
            </FormField>
            <FormField label="フリガナ" htmlFor="g-furigana">
              <input id="g-furigana" className={inputClass} value={g.furigana} onChange={(e) => guardian.setField("furigana", e.target.value)} placeholder="ヤマダ ハナコ" />
            </FormField>
            <FormField label="続柄" htmlFor="g-relationship">
              <input id="g-relationship" className={inputClass} list="g-relationship-options" value={g.relationship} onChange={(e) => guardian.setField("relationship", e.target.value)} placeholder="母" />
              <datalist id="g-relationship-options">
                {["母", "父", "祖母", "祖父", "その他"].map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </FormField>
            <FormField label="電話番号" htmlFor="g-phone" error={guardian.errors.phone}>
              <input id="g-phone" className={inputClass} inputMode="tel" value={g.phone} onChange={(e) => guardian.setField("phone", e.target.value)} placeholder="090-1234-5678" />
            </FormField>
            <FormField label="緊急連絡先" htmlFor="g-emergency" error={guardian.errors.emergencyContact} hint="電話番号とは別の連絡先がある場合に入力します">
              <input id="g-emergency" className={inputClass} inputMode="tel" value={g.emergencyContact} onChange={(e) => guardian.setField("emergencyContact", e.target.value)} placeholder="080-1234-5678" />
            </FormField>
            <FormField label="メールアドレス" htmlFor="g-email" error={guardian.errors.email}>
              <input id="g-email" type="email" className={inputClass} value={g.email} onChange={(e) => guardian.setField("email", e.target.value)} placeholder="example@example.com" />
            </FormField>

            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={g.sameAddressAsBeneficiary}
                  onChange={(e) => guardian.setField("sameAddressAsBeneficiary", e.target.checked)}
                />
                住所は利用者と同じ
              </label>
            </div>

            {g.sameAddressAsBeneficiary ? (
              <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm sm:col-span-2">
                {addressText(sections.personal.postalCode, sections.personal.address) || (
                  <span className="text-zinc-500">利用者の住所が未入力です。本人情報の「編集」から入力してください。</span>
                )}
              </div>
            ) : (
              <>
                <FormField label="郵便番号" htmlFor="g-postal" error={guardian.errors.postalCode}>
                  <input id="g-postal" className={inputClass} inputMode="numeric" value={g.postalCode} onChange={(e) => guardian.setField("postalCode", e.target.value)} placeholder="123-4567" />
                </FormField>
                <div className="hidden sm:block" />
                <FormField label="住所" htmlFor="g-address" wide>
                  <input id="g-address" className={inputClass} value={g.address} onChange={(e) => guardian.setField("address", e.target.value)} />
                </FormField>
              </>
            )}
          </FormGrid>
        ) : (
          <InfoGrid>
            <InfoItem label="保護者氏名">
              <DisplayValue value={sections.guardian.name} />
            </InfoItem>
            <InfoItem label="フリガナ">
              <DisplayValue value={sections.guardian.furigana} />
            </InfoItem>
            <InfoItem label="続柄">
              <DisplayValue value={sections.guardian.relationship} />
            </InfoItem>
            <InfoItem label="電話番号">
              <DisplayValue value={sections.guardian.phone} />
            </InfoItem>
            <InfoItem label="緊急連絡先">
              <DisplayValue value={sections.guardian.emergencyContact} />
            </InfoItem>
            <InfoItem label="メールアドレス">
              <DisplayValue value={sections.guardian.email} />
            </InfoItem>
            <InfoItem label="住所" wide>
              <DisplayValue value={addressText(guardianAddress.postalCode, guardianAddress.address)} />
              {sections.guardian.sameAddressAsBeneficiary && (
                <span className="ml-2 text-xs text-zinc-500">（利用者と同じ）</span>
              )}
            </InfoItem>
          </InfoGrid>
        )}
      </SectionCard>
    </div>
  );
}
