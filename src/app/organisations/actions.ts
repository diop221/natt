"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/tontines/[id]/actions";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { normalizePhone } from "@/lib/phone";

async function requireAdmin(orgId: string) {
  const user = await getCurrentUser();
  const admin = user && (await db.orgMember.findFirst({ where: { orgId, userId: user.id, role: "ADMIN" } }));
  return admin ? user : null;
}

export async function createOrg(form: FormData) {
  const user = await getCurrentUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!user || !name) return;
  const org = await db.organization.create({ data: { name, members: { create: { userId: user.id, role: "ADMIN" } } } });
  redirect(`/organisations/${org.id}`);
}

export async function addOrgMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const orgId = String(form.get("orgId"));
  if (!(await requireAdmin(orgId))) return { error: "Action non autorisée." };
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const user = phone ? await db.user.findUnique({ where: { phone } }) : null;
  if (!user) return { error: (await getDict()).orgs.unknownUser };
  await db.orgMember.upsert({ where: { orgId_userId: { orgId, userId: user.id } }, create: { orgId, userId: user.id }, update: {} });
  revalidatePath(`/organisations/${orgId}`);
  return { ok: user.name };
}

export async function setOrgRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("orgMemberId"));
  const om = await db.orgMember.findUnique({ where: { id } });
  const me = om && (await requireAdmin(om.orgId));
  if (!om || !me) return { error: "Action non autorisée." };
  const role = form.get("role") === "ADMIN" ? "ADMIN" : "MEMBER";
  // Le bureau ne peut pas se vider : il reste toujours au moins un administrateur.
  if (role === "MEMBER" && (await db.orgMember.count({ where: { orgId: om.orgId, role: "ADMIN" } })) <= 1) {
    return { error: "L'association doit garder au moins un membre au bureau." };
  }
  await db.orgMember.update({ where: { id }, data: { role } });
  revalidatePath(`/organisations/${om.orgId}`);
}
