import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { normName, syncRewards } from "@/lib/rewards";

export const runtime = "nodejs";

const id = z.string().min(1).max(64);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("alias"), sheetName: z.string().trim().min(1).max(80), userId: id.nullable() }),
  z.object({ action: z.literal("void"), key: z.string().min(1).max(400), voided: z.boolean() }),
  z.object({ action: z.literal("award"), awardId: id, op: z.enum(["paid", "unpaid", "revoke"]) }),
  z.object({
    action: z.literal("item"),
    itemId: id.optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).optional(),
    kind: z.enum(["cash", "item", "perk"]),
    costPoints: z.number().int().min(1).max(1_000_000),
    active: z.boolean(),
  }),
  z.object({ action: z.literal("redeem"), userId: id, itemId: id }),
  z.object({ action: z.literal("redemption"), redemptionId: id, op: z.enum(["fulfill", "reject"]) }),
  z.object({
    action: z.literal("points"),
    userId: id,
    delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "Enter a non-zero amount"),
    reason: z.string().trim().min(1).max(120),
  }),
]);

class UserError extends Error {}

/** Admin-only rewards actions (the whole feature is admin-only while testing). */
export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  try {
    switch (body.action) {
      case "sync":
        return NextResponse.json(await syncRewards());

      case "alias": {
        const sheetName = normName(body.sheetName);
        await prisma.editorAlias.upsert({
          where: { sheetName },
          create: { sheetName, userId: body.userId },
          update: { userId: body.userId },
        });
        break;
      }

      case "void":
        await prisma.sheetCreative.update({
          where: { key: body.key },
          data: { voidedAt: body.voided ? new Date() : null },
        });
        break;

      case "award": {
        const award = await prisma.bonusAward.findUnique({ where: { id: body.awardId } });
        if (!award) throw new UserError("Award not found");
        if (body.op === "revoke") {
          if (award.revokedAt) throw new UserError("Already revoked");
          // The row stays (so the next sync doesn't re-award it); its points come back off.
          await prisma.$transaction([
            prisma.bonusAward.update({ where: { id: award.id }, data: { revokedAt: new Date() } }),
            ...(award.points
              ? [
                  prisma.pointsEntry.create({
                    data: { userId: award.userId, delta: -award.points, reason: `Revoked ${award.kind.toLowerCase()} bonus ${award.period}`, createdBy: me.email },
                  }),
                ]
              : []),
          ]);
        } else {
          if (award.revokedAt) throw new UserError("This award was revoked");
          await prisma.bonusAward.update({
            where: { id: award.id },
            data: { paidAt: body.op === "paid" ? new Date() : null },
          });
        }
        break;
      }

      case "item": {
        const data = {
          name: body.name,
          description: body.description || null,
          kind: body.kind,
          costPoints: body.costPoints,
          active: body.active,
        };
        if (body.itemId) await prisma.rewardItem.update({ where: { id: body.itemId }, data });
        else await prisma.rewardItem.create({ data });
        break;
      }

      case "redeem":
        await prisma.$transaction(async (tx) => {
          // Serialise spends per editor so two redemptions can't both pass the balance check.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.userId}))`;
          const item = await tx.rewardItem.findUnique({ where: { id: body.itemId } });
          if (!item || !item.active) throw new UserError("That reward isn't available");
          const balance = (await tx.pointsEntry.aggregate({ where: { userId: body.userId }, _sum: { delta: true } }))._sum.delta ?? 0;
          if (balance < item.costPoints) throw new UserError(`Not enough points (${balance} of ${item.costPoints})`);
          await tx.redemption.create({
            data: { userId: body.userId, itemId: item.id, itemName: item.name, costPoints: item.costPoints },
          });
          await tx.pointsEntry.create({
            data: { userId: body.userId, delta: -item.costPoints, reason: `Redeemed: ${item.name}`, createdBy: me.email },
          });
        });
        break;

      case "redemption": {
        const r = await prisma.redemption.findUnique({ where: { id: body.redemptionId } });
        if (!r) throw new UserError("Redemption not found");
        if (r.status !== "PENDING") throw new UserError("Already resolved");
        const resolved = { resolvedBy: me.email, resolvedAt: new Date() };
        await prisma.$transaction([
          prisma.redemption.update({
            where: { id: r.id },
            data: { status: body.op === "fulfill" ? "FULFILLED" : "REJECTED", ...resolved },
          }),
          // Rejecting refunds the points.
          ...(body.op === "reject"
            ? [prisma.pointsEntry.create({ data: { userId: r.userId, delta: r.costPoints, reason: `Refund: ${r.itemName}`, createdBy: me.email } })]
            : []),
        ]);
        break;
      }

      case "points":
        await prisma.pointsEntry.create({
          data: { userId: body.userId, delta: body.delta, reason: body.reason, createdBy: me.email },
        });
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: error.message }, { status: 400 });
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Rewards action failed";
    return NextResponse.json({ error: message }, { status: body.action === "sync" ? 502 : 500 });
  }
}
