import { ActionForm } from "@/components/ActionForm";
import { NETWORKS } from "@/lib/format";
import { type Dict, tf } from "@/lib/i18n";
import { formatXof } from "@/lib/money";
import type { TontineDetail } from "@/lib/tontine";
import {
  announceAction,
  confirmOrderAction,
  contactsAction,
  decideIncidentAction,
  evidenceAction,
  reportIncidentAction,
  suspendAction,
} from "./actions";

// Sections de la page d'une tontine : réserve de fin de cycle, situations exceptionnelles et
// contacts, annonces de l'organisateur.

const card = "card space-y-3 p-5";
const input = "input";
const button = "btn";
const link = "link";

type Member = TontineDetail["members"][number];

export function PurchaseSection({ tontine, t, me, manage }: { tontine: TontineDetail; t: Dict; me: Member | undefined; manage: boolean }) {
  const { offer } = tontine;
  if (!offer) return null;
  return (
    <section className={card}>
      <div>
        <h2 className="font-semibold">{tf(t.purchase.title, { offer: offer.title })}</h2>
        <p className="text-sm text-muted">{tf(t.purchase.by, { merchant: offer.merchant.name, city: offer.merchant.city })}</p>
      </div>
      <p className="text-sm text-muted">{tf(t.purchase.how, { price: formatXof(offer.nattPriceXof) })}</p>
      {offer.delivery && <p className="text-sm text-muted">{offer.delivery}</p>}
      <h3 className="text-sm font-medium">{t.purchase.orders}</h3>
      {tontine.orders.length === 0 ? (
        <p className="text-sm text-muted">{t.purchase.noOrders}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {tontine.orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {o.member.name} · <span className="text-muted">{t.purchase.statuses[o.status as keyof typeof t.purchase.statuses]}</span>
              </span>
              {(o.status === "PAID" || o.status === "DELIVERED") && (o.memberId === me?.id || manage) && (
                <ActionForm action={confirmOrderAction}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button className={link}>{t.purchase.confirm}</button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReserveSection({ tontine, t }: { tontine: TontineDetail; t: Dict }) {
  if (tontine.reserveBps === 0) return null;
  const holders = tontine.members.filter((m) => m.reserveXof > 0);
  return (
    <section className={card}>
      <h2 className="font-semibold">{t.reserve.title}</h2>
      <p className="text-sm text-muted">{tf(t.reserve.help, { pct: (tontine.reserveBps / 100).toLocaleString("fr-FR") })}</p>
      {tontine.reserveEntries.length === 0 ? (
        <p className="text-sm text-muted">{t.reserve.none}</p>
      ) : (
        <>
          <ul className="divide-y divide-border text-sm">
            {holders.map((m) => (
              <li key={m.id} className="flex justify-between py-1">
                <span>{m.name}</span>
                <span className="text-accent">{tf(t.reserve.held, { amount: formatXof(m.reserveXof) })}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-sm">
            {tontine.reserveEntries.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-muted">
                  {e.member.name} · {e.label}
                </span>
                <span className={e.amountXof < 0 ? "text-danger" : "text-accent"}>
                  {e.amountXof > 0 ? "+" : ""}
                  {formatXof(e.amountXof)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function IncidentsSection({
  tontine,
  t,
  me,
  manage,
  dateTime,
}: {
  tontine: TontineDetail;
  t: Dict;
  me: Member | undefined;
  manage: boolean;
  dateTime: (d: Date) => string;
}) {
  const active = tontine.status !== "COMPLETED";
  if (!active && tontine.incidents.length === 0) return null;
  return (
    <section className={card}>
      <h2 className="font-semibold">{t.incident.title}</h2>
      <p className="text-sm text-muted">{t.incident.help}</p>
      {tontine.incidents.length === 0 ? (
        <p className="text-sm text-muted">{t.incident.none}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {tontine.incidents.map((i) => (
            <li key={i.id} className="space-y-2 py-3">
              <p>
                <span className="font-medium">{i.member.name}</span> · {t.incident.kinds[i.kind as keyof typeof t.incident.kinds]} · {i.description}
                <span className="block text-xs text-muted">
                  {i.status === "OPEN" ? t.incident.open : t.incident.closed}
                  {i.member.suspendedAt && i.status === "OPEN" && ` · ${t.incident.suspended}`} · {dateTime(i.createdAt)}
                  {i.decision && ` · ${t.incident.decisions[i.decision as keyof typeof t.incident.decisions]}`}
                  {i.decisionNote && ` : ${i.decisionNote}`}
                </span>
                {i.evidence && (
                  <span className="block text-xs text-muted">
                    {t.incident.evidence} : {i.evidence}
                  </span>
                )}
              </p>
              {manage && i.status === "OPEN" && <IncidentTools incident={i} t={t} />}
            </li>
          ))}
        </ul>
      )}
      {active && (me || manage) && (
        <details>
          <summary className={`${link} cursor-pointer`}>{t.incident.report}</summary>
          <ActionForm action={reportIncidentAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="block text-sm">{t.incident.member}</span>
              <select name="memberId" defaultValue={me?.id} className={`${input} w-full`}>
                {tontine.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-sm">{t.incident.kind}</span>
              <select name="kind" className={`${input} w-full`}>
                {Object.entries(t.incident.kinds).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="block text-sm">{t.incident.description}</span>
              <input name="description" required maxLength={300} className={`${input} w-full`} />
            </label>
            <button className={`${button} sm:col-span-2 sm:justify-self-start`}>{t.incident.send}</button>
          </ActionForm>
        </details>
      )}
      {active && me && <ContactsForm tontineId={tontine.id} me={me} t={t} />}
    </section>
  );
}

function IncidentTools({ incident: i, t }: { incident: TontineDetail["incidents"][number]; t: Dict }) {
  const m = i.member;
  return (
    <div className="space-y-3 rounded-lg bg-background p-3">
      {(m.emergencyPhone || m.heirPhone) && (
        <div className="space-y-1 text-xs text-muted">
          {m.emergencyPhone && <p>{tf(t.incident.emergency, { name: m.emergencyName ?? "?", phone: m.emergencyPhone })}</p>}
          {m.heirPhone && <p>{tf(t.incident.designated, { name: m.heirName ?? "?", relation: m.heirRelation ?? "?", phone: m.heirPhone })}</p>}
        </div>
      )}
      {!m.suspendedAt && (
        <ActionForm action={suspendAction}>
          <input type="hidden" name="incidentId" value={i.id} />
          <button className={link}>{t.incident.suspend}</button>
        </ActionForm>
      )}
      <ActionForm action={evidenceAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="incidentId" value={i.id} />
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-sm">{t.incident.evidence}</span>
          <input name="evidence" required maxLength={300} defaultValue={i.evidence ?? ""} placeholder={t.incident.evidencePlaceholder} className={`${input} w-full`} />
        </label>
        <button className={button}>{t.incident.recordEvidence}</button>
        <p className="basis-full text-xs text-muted">{t.incident.evidenceHelp}</p>
      </ActionForm>
      <ActionForm action={decideIncidentAction} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="incidentId" value={i.id} />
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-sm">{t.incident.decide}</span>
          <select name="decision" className={`${input} w-full`}>
            {Object.entries(t.incident.decisions).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <input name="heirName" defaultValue={m.heirName ?? ""} placeholder={t.incident.heirName} maxLength={60} className={input} />
        <input name="heirPhone" type="tel" defaultValue={m.heirPhone ?? ""} placeholder={t.incident.heirPhone} className={input} />
        <select name="network" defaultValue="wave" className={input}>
          {Object.entries(NETWORKS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input name="note" placeholder={t.incident.note} maxLength={300} className={input} />
        <p className="text-xs text-muted sm:col-span-2">{t.incident.transferNeedsEvidence}</p>
        <button className={`${button} sm:col-span-2 sm:justify-self-start`}>{t.incident.close}</button>
      </ActionForm>
    </div>
  );
}

function ContactsForm({ tontineId, me, t }: { tontineId: string; me: Member; t: Dict }) {
  return (
    <details>
      <summary className={`${link} cursor-pointer`}>{t.contacts.title}</summary>
      <p className="mt-2 text-xs text-muted">{t.contacts.help}</p>
      <ActionForm action={contactsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="tontineId" value={tontineId} />
        <input name="emergencyName" defaultValue={me.emergencyName ?? ""} placeholder={t.contacts.emergencyName} maxLength={60} className={input} />
        <input name="emergencyPhone" type="tel" defaultValue={me.emergencyPhone ?? ""} placeholder={t.contacts.emergencyPhone} className={input} />
        <input name="heirName" defaultValue={me.heirName ?? ""} placeholder={t.contacts.heirName} maxLength={60} className={input} />
        <input name="heirPhone" type="tel" defaultValue={me.heirPhone ?? ""} placeholder={t.contacts.heirPhone} className={input} />
        <input name="heirRelation" defaultValue={me.heirRelation ?? ""} placeholder={t.contacts.heirRelation} maxLength={60} className={input} />
        <button className={`${button} sm:justify-self-start`}>{t.common.save}</button>
      </ActionForm>
    </details>
  );
}

export function AnnounceSection({ tontineId, t }: { tontineId: string; t: Dict }) {
  return (
    <section className={card}>
      <h2 className="font-semibold">{t.announce.title}</h2>
      <ActionForm action={announceAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tontineId" value={tontineId} />
        <textarea name="text" required maxLength={500} rows={2} placeholder={t.announce.placeholder} className={`${input} min-w-0 flex-1`} />
        <button className={button}>{t.announce.send}</button>
        <p className="basis-full text-xs text-muted">{t.voice.help}</p>
      </ActionForm>
    </section>
  );
}
