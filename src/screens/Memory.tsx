// Profile memory (SPR-24): what Sprigo remembers about the learner, with a switch, editing and forgetting.
// A summary card on the profile; the details open in a sheet.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons";
import { useApp } from "../store";
import * as db from "../db";
import { MEMORY_KINDS, MEMORY_TEXT_MAX, type Memory } from "../memory";
import { ToggleRow } from "./Settings";
import { SummaryCard } from "./Coach";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

export function MemoryCard() {
  const { t } = useTranslation();
  const { profile, s, sheet, openSheet } = useApp();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { if (!sheet) db.listMemories(profile!.id).then((m) => setN(m.length)); }, [profile!.id, !sheet]); // fresh after the sheet closes
  if (n === null) return null;
  const line = !s.memoryOn ? t("settings.off") : n ? t("memory.count", { count: n }) : t("memory.none");
  return <SummaryCard icon="spark" color="var(--gold-dark)" title={t("memory.title")} line={line} onOpen={() => openSheet(<MemorySheet />)} />;
}

function MemorySheet() {
  const { t } = useTranslation();
  const { profile, s, setS, closeSheet } = useApp();
  const [items, setItems] = useState<Memory[]>([]);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [sure, setSure] = useState(false); // "forget all" asks once more
  const reload = () => db.listMemories(profile!.id).then(setItems);
  useEffect(() => { reload(); }, [profile!.id]);

  const save = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    await (text ? db.updateMemory(editing.id, text) : db.deleteMemory(editing.id)); // emptied = forgotten
    setEditing(null); reload();
  };
  const remove = async (id: number) => { await db.deleteMemory(id); reload(); };
  const forgetAll = async () => { await db.forgetMemories(profile!.id); setSure(false); reload(); };

  return (
    <div className="sheet-wide">
      <h3>{t("memory.title")}</h3>
      <div className="od-stack" style={gap("12px")}>
        <ToggleRow k="memory" initial={s.memoryOn} onChange={(memoryOn) => setS((s) => ({ ...s, memoryOn }))} />
        {!items.length
          ? <p className="muted small">{t(s.memoryOn ? "memory.empty" : "memory.emptyOff")}</p>
          : <div className="card od-stack" style={gap("14px")}>
              <span className="muted small">{t("memory.hint")}</span>
              {MEMORY_KINDS.map((k) => {
                const mine = items.filter((m) => m.kind === k);
                return mine.length > 0 && (
                  <div className="od-stack" style={gap("6px")} key={k}>
                    <b className="small">{t(`memory.kinds.${k}`)}</b>
                    {mine.map((m) => editing?.id === m.id
                      ? <form className="od-row" style={gap("8px")} key={m.id} onSubmit={(e) => { e.preventDefault(); save(); }}>
                          <input className="input od-fill" autoFocus maxLength={MEMORY_TEXT_MAX} value={editing.text} aria-label={t("memory.edit")}
                            onChange={(e) => setEditing({ id: m.id, text: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
                          <button className="btn btn-primary" type="submit">{t("memory.save")}</button>
                        </form>
                      : <div className="od-row" style={gap("8px")} key={m.id}>
                          <button className="row-item od-fill" style={{ textAlign: "left" }} title={t("memory.edit")} onClick={() => setEditing({ id: m.id, text: m.text })}>{m.text}</button>
                          <button className="btn btn-ghost" aria-label={t("memory.forget", { text: m.text })} title={t("memory.forgetOne")} onClick={() => remove(m.id)}><Icon name="x" /></button>
                        </div>)}
                  </div>
                );
              })}
              {sure
                ? <div className="od-row" style={gap("8px")}>
                    <span className="small od-fill">{t("memory.forgetAllSure")}</span>
                    <button className="btn btn-ghost" onClick={() => setSure(false)}>{t("memory.cancel")}</button>
                    <button className="btn btn-danger" onClick={forgetAll}>{t("memory.forgetAll")}</button>
                  </div>
                : <button className="btn btn-ghost" onClick={() => setSure(true)}>{t("memory.forgetAll")}</button>}
            </div>}
        <button className="btn btn-ghost" onClick={closeSheet}>{t("sheet.close")}</button>
      </div>
    </div>
  );
}
