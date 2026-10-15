import { db } from "@/lib/db";

// Une tontine est visible par son organisateur, ses membres, les proches qui cotisent pour eux
// et les membres de l'association qui la gère.
export const visibleTo = (userId: string) => ({
  OR: [
    { ownerId: userId },
    { members: { some: { OR: [{ userId }, { sponsorUserId: userId }] } } },
    { org: { members: { some: { userId } } } },
  ],
});

export async function canViewTontine(userId: string, tontineId: string) {
  return (await db.tontine.count({ where: { id: tontineId, ...visibleTo(userId) } })) > 0;
}

// Gérer : l'organisateur, ou le bureau (ADMIN) de l'association.
export async function canManageTontine(userId: string, tontineId: string) {
  const n = await db.tontine.count({
    where: {
      id: tontineId,
      OR: [{ ownerId: userId }, { org: { members: { some: { userId, role: "ADMIN" } } } }],
    },
  });
  return n > 0;
}

// Relie au compte les places de membre (et de parrain) enregistrées avec son numéro.
export async function linkMemberships(userId: string, phone: string) {
  await db.member.updateMany({ where: { phone, userId: null }, data: { userId } });
  await db.member.updateMany({ where: { sponsorPhone: phone, sponsorUserId: null }, data: { sponsorUserId: userId } });
}
