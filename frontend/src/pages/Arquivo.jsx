import React from "react";
import { useAuth } from "../context/AuthContext";
import ClubArchive from "../components/ClubArchive";
import EditableText from "../components/EditableText";

/** 🏆 Historial, Palmarés e Arquivo Documental da ARDN — consulta do staff. */
export default function Arquivo() {
  const { user } = useAuth();
  const canEdit = ["admin", "presidente", "tesoureiro"].includes(user?.role);

  return (
    <div className="p-5 md:p-8 space-y-4 animate-in" data-testid="arquivo-page">
      <div>
        <EditableText k="page.arquivo.title" as="h1" className="font-outfit text-2xl md:text-3xl font-bold text-white">
          Historial e Palmarés
        </EditableText>
        <p className="text-sm text-slate-400 mt-1">
          Memória do clube, títulos das equipas e arquivo documental. Visível também na App Sócio.
        </p>
      </div>
      <ClubArchive scope="staff" canEdit={canEdit} />
    </div>
  );
}
