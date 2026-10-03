"use client";

// カルテの各カード（本人情報・保護者・契約…）の「閲覧 → 編集 → 保存」を共通化するフック。
// 同時に編集できるカードは1つだけ（editingId をページで1つ持つ）にして、
// 別のカードの未保存の入力が気づかないうちに失われないようにする。
import { useState } from "react";
import type { FieldErrors } from "@/lib/beneficiaryChart/model";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import type { ResultMessage } from "../../components/chartUi";

export type SectionEditorControl = {
  editingId: string | null;
  setEditingId: (id: string | null) => void;
};

export function useSectionEditor<T>(params: {
  id: string;
  control: SectionEditorControl;
  initial: () => T;
  validate: (draft: T) => FieldErrors;
  save: (draft: T) => Promise<void>;
}) {
  const { id, control, initial, validate, save } = params;
  const editing = control.editingId === id;

  const [draft, setDraft] = useState<T>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<ResultMessage>(null);

  const start = () => {
    setDraft(initial());
    setErrors({});
    setMessage(null);
    control.setEditingId(id);
  };

  const cancel = () => {
    setErrors({});
    setMessage(null);
    control.setEditingId(null);
  };

  const setField = <K extends keyof T>(key: K, value: T[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: undefined } : prev));
  };

  const submit = async () => {
    if (saving) return;
    const found = validate(draft);
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      setMessage({ kind: "error", text: "入力内容に誤りがあります。赤字の項目を確認してください。" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await save(draft);
      setErrors({});
      setMessage({ kind: "ok", text: "保存しました。" });
      control.setEditingId(null);
    } catch (e) {
      // 入力内容はそのまま残し、もう一度「保存する」を押せば再送できるようにする
      setMessage({ kind: "error", text: friendlyChartError(e, "save") });
    } finally {
      setSaving(false);
    }
  };

  return {
    editing,
    canEdit: control.editingId === null,
    draft,
    setField,
    errors,
    saving,
    message,
    start,
    cancel,
    submit,
  };
}
