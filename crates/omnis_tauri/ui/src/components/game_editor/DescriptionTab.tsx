import React from "react";
import { GameEditorFormData } from "./types";

interface DescriptionTabProps {
  formData: GameEditorFormData;
  onChange: (fields: Partial<GameEditorFormData>) => void;
}

export const DescriptionTab: React.FC<DescriptionTabProps> = ({ formData, onChange }) => {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-medium mb-1.5 text-slate-300">
          Sinossi / Descrizione Ufficiale
        </label>
        <textarea
          rows={8}
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border text-sm font-normal leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          placeholder="Inserisci qui la sinossi o descrizione del gioco..."
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5 text-slate-300">
          Note Personali (Playnite Parity)
        </label>
        <textarea
          rows={5}
          value={formData.user_notes}
          onChange={(e) => onChange({ user_notes: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border text-sm font-normal leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          placeholder="Appunti sul gameplay, build usata, promemoria salvataggi o trucchi..."
        />
      </div>
    </div>
  );
};
