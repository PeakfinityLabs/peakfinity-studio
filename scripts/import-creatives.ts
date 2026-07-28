/**
 * One-time import of the team's "HealthyBlood - New Creative Tracking" Google
 * Sheet into the in-app creative tracker.
 *
 *   npx tsx scripts/import-creatives.ts            # dry run (prints a summary)
 *   npx tsx scripts/import-creatives.ts --commit   # actually write rows
 *
 * Idempotent: a row is skipped when one with the same month + title already
 * exists, so re-running never duplicates.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { CreativePriority, CreativeStatus } from "../src/generated/prisma/enums";

config({ path: ".env.local" });
config();

// Tab-separated export of the sheet. Columns:
// LP | Page | Strategist | Title | Brief Link | Editor | Video Link |
// Content Needed? | Status | Priority | AI Model | Launched | COG Score | Winner
const JUNE = String.raw`
	HealthyBlood	Jonah	4 Stages	4 Stages	Mark	https://myworkspace.krock.io/sl/aei-msdw-gnc	Yes	Ready	Normal		7/10/2026
	HealthyBlood	Jonah	Pissed Off	Pissed Off	Mark	https://myworkspace.krock.io/sl/uqp-vdi--8gj	Yes	Ready	Normal		7/18/26
	HealthyBlood	Jonah	These Don't Work	These Don't Work	Mark	https://myworkspace.krock.io/sl/mua-jflz-vsl	Yes	Ready	Normal		7/18/26
	HealthyBlood	Jonah	8 Weeks	8 Weeks	Cassie		Yes		Normal
`;

const JULY = String.raw`
	HealthyBlood	Jonah	LP(a) - 1	LP(a) - 1	Mark	https://myworkspace.krock.io/sl/9c--aacq-qoy	Yes	Ready	Urgent	Google Omni	7/3/26
	HealthyBlood	Jonah	Avoid Statins	Avoid Statins	Mark	https://myworkspace.krock.io/sl/ua8-u4eq-pg1	Yes	Ready	Urgent	Google Omni	7/18/26
	HealthyBlood	Jonah	5 Things	5 Things	Mark	https://myworkspace.krock.io/sl/hpg-vuxd-6zd	Yes	Ready	Urgent	Google Omni	7/18/26
	HealthyBlood	Jonah	Fishing Script	Fishing Script	Charles	https://myworkspace.krock.io/sl/gtc-mjvz-sws	Yes	Ready	Urgent	Kling 3.0	7/18/26	100
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	Comparison Conference	Comparison Conference	Charles	https://myworkspace.krock.io/sl/mov-rmri-xbj	Yes	Needs Review	Important	Google Omni
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	Comparison	Comparison	Lianne		Yes	Editing	Important	Kling 3.0
Main page	HealthyBlood	Emilis	Compliant Podcast Winner Avatar ITR	EK0701	Charles		Yes		Important	Google Omni
Main page	Wellness Journal	Emilis	Asian Monk Storytelling	EK0702	Ali	https://myworkspace.krock.io/sl/f0d-kkkv-noe	Yes	Ready	Normal	Google Omni	7/28/26	30
Main page	HealthyBlood	Emilis	Timeline Transformation	EK0703	Ali	https://myworkspace.krock.io/sl/wlp-qcev-vbq	Yes	Ready	Normal	Google Omni	7/28/26	30
Main page	Wellness Journal	Emilis	Physical Symptoms Call Out - Cholesterol UMP	EK0704	Lianne		Yes		Important	Kling 3.0
Main page	Wellness Journal	Emilis	Physical Symptoms Call Out - LDL UMP - Men	EK0705	Cassie		Yes		Normal	Kling 3.0
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	Comparison Podcast	Comparison Podcast	Lianne	https://myworkspace.krock.io/sl/2gd-wawt-itz	Yes	Ready	Important	Google Omni	7/21/26	30
Main page, but I think it could be worth a test for the comparison as well	BeyondThePill	Jarrah	5 habits	5 habits	Cassie	https://myworkspace.krock.io/sl/gfc-5aqd-nm_	Yes	Ready	Normal	Google Omni	7/24/26	40	GCV
Main page.	Wellness Journal	Jarrah	AI UGC POV	AI UGC POV	Charles	https://myworkspace.krock.io/sl/o7o-obml-2ui	Yes	Ready	Urgent	Kling 3.0	7/20/26	70
Main Page	Wellness Journal	Jonah	Truck Driver Cholesterol	Truck Driver Cholesterol	Charles	https://myworkspace.krock.io/sl/z7o-u7x9-nkt	Yes	Ready	Important	Kling 3.0	7/24/26	100
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	5 Habits - Black DR	5 Habits - Black DR	Lianne		Yes		Normal	Google Omni
Main Page.	Wellness Journal	Jarrah	Daughter	Daughter	Charles		Yes	Editing	Important	Kling 3.0
Main Page.	HealthyBlood	Jarrah	Skeleton what happens	Skeleton what happens	Ali	https://myworkspace.krock.io/sl/ugf-gy3g-mry	Yes	Needs Revision	Normal
Main Page.	Wellness Journal	Jarrah	This is Clogged Arteries	This is Clogged Arteries	Charles	https://myworkspace.krock.io/sl/xsw-og5a-kcx	Yes	Ready	Urgent	Google Omni	7/28/26	40
Main Page	HealthyBlood	Jarrah	5 Signs AI DR	5 signs AI DR	Cassie	https://myworkspace.krock.io/sl/_jn-jsf7-mbr	Yes	Ready	Important	Google Omni	7/24/26	60
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	Split Screen Interview	Split Screen Interview	Cassie		Yes		Normal	Kling 3.0
Main Page	Wellness Journal	Jarrah	Lower Cholesterol Naturally	Lower Cholesterol Naturally	Charles		Yes		Important	Kling 3.0
Main page	Wellness Journal	Emilis	ITR 5 Things About Statins	EK0706	Cassie	https://myworkspace.krock.io/sl/yxk-7fyj-d7d	Yes	Ready	Normal	Kling 3.0	7/28/26	30
Main page	BeyondThePill	Emilis	Winner ITR Avoiding Statins	EK0707	Cassandra		Yes		Normal	Google Omni
Main page	Wellness Journal	Emilis	Timeline Transformation Future Pacing	EK0708	Cassandra		Yes		Normal
Main page	Wellness Journal	Emilis	Comparison and Red Yeast UMS	EK0709	Janren		Yes		Normal	Google Omni
Main Page	Wellness Journal	Jarrah	Jewish Dr - this is X	Jewish Dr - this is X	Charles		Yes	Editing	Normal	Kling 3.0
https://www.tryhealthyblood.com/pages/agg-cro?_ab=0&key=1784539041343	Blood Pressure	Jarrah	This is what artery looks like	This is what artery looks like	Lianne	https://myworkspace.krock.io/sl/fv8-wsqa-viy	Yes	Ready	Normal	Kling 3.0	7/28/26	30
Main Page	Wellness Journal	Jarrah	Barbra Natural Remedy	Barba o'neal	Ali		Yes		Urgent	Pixverse
Main Page	Wellness Journal	Jarrah	Barbra 2.0	Barbra 2.0	Ali		Yes		Urgent	Pixverse
Main Page	HealthyBlood	Jarrah	Nature's Statin	Nature's Statin	Lianne	https://myworkspace.krock.io/sl/crm-rfnz-hib	Yes	Ready	Urgent	Kling 3.0	7/24/26	50
Main Page	BeyondThePill	Jarrah	Whiteboard - HB	Whiteboard - HB	Janren		Yes	Scripting	Normal	Kling 3.0
Main Page	HealthyBlood	Jarrah	I'm 62 Pixar	I'm 62 Pixar	Lianne		Yes		Normal	Kling 3.0
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	Rating DR	Rating DR	Janren		Yes		Urgent	Kling 3.0
Main Page	HealthyBlood	Jarrah	What happens to your arteries	What happens to your arteries	Cassie		Yes		Normal	Google Omni
https://www.thestatinstory.com/pages/top-5	BeyondThePill	Jarrah	This is X - Comparison	This is X - Comaprison	Cassandra		Yes		Normal	Kling 3.0
Main Page	Wellness Journal	Emilis	Reverse Timeline (What If)	EK0710	Charles		Yes		Normal	Kling 3.0
Main Page	Wellness Journal	Emilis	Statin Side Effects	EK0711	Charles		Yes		Normal	Kling 3.0
Main Page	BeyondThePill	Emilis	Heart Attack Testimonial	EK0712	Ali		Yes		Normal	Google Omni
Main Page	Wellness Journal	Emilis	Storytelling Saved My Husband's Life	EK0713	Ali		Yes		Normal	Google Omni
Main Page	Wellness Journal	Emilis	You Are Young Once	EK0714	Ali		Yes		Normal	Google Omni
Main Page	HealthyBlood	Jarrah	Artery Walls	Artery walls	Cassie	https://myworkspace.krock.io/sl/arh-gtjx-zk-	Yes	Ready	Urgent	Kling 3.0	7/28/26	50
Main Page	HealthyBlood	Jarrah	This is a 35 year old artery	This is a 35 year old artery	Janren		Yes		Urgent	Kling 3.0
Main Page	Wellness Journal	Jarrah	Statins Podcast	Statins Podcast	Cassandra		Yes		Important	Kling 3.0
Main Page	HealthyBlood	Jarrah	Dear Younger Self	Dear Younger Self	Lianne		Yes		Normal	Kling 3.0
Main Page	Wellness Journal	Jarrah	Personal experience statin	This is the secret woman	Janren		Yes		Normal	Kling 3.0
Main Page	HealthyBlood	Jarrah	Most don't realize	Most don't realize	Cassie	https://myworkspace.krock.io/sl/p8n-finw-zzi	Yes	Needs Review	Normal	Kling 3.0
Main Page	BeyondThePill	Jarrah	Dr Talking head	Dr talking head	Lianne		Yes		Urgent	Kling 3.0
Main Page	Wellness Journal	Jarrah	Podcast, statins convo	Podcast, satins convo	Charles		Yes		Urgent	Kling 3.0
Main Page	Wellness Journal	Jarrah	Amish Breaking News	Amish Breaking News	Lianne		Yes		Important	Kling 3.0
Main Page	Wellness Journal	Jarrah	Statin Side Effects	Statin side effects	Ali		Yes		Normal	Google Omni
Main Page	Wellness Journal	Emilis	Cardiologist Statins FAQ	EK0715	Charles		Yes		Normal	Google Omni
Main Page	Wellness Journal	Emilis	LDL Filters in Liver	EK0716	Charles		No		Normal
Main Page	Wellness Journal	Emilis	Statin Refugee Recovery Storytelling	EK0717	Ali		No		Normal
Main Page	Wellness Journal	Emilis	Oxidation Experiment Storytelling	EK0718	Ali		No		Normal
Main Page	Wellness Journal	Emilis	Statin Side Effect Explainer	EK0719	Ali		Yes		Normal	Google Omni
Main Page	Wellness Journal	Emilis	Sticky LDL UGC Testimonial	EK0720	Cassie		Yes		Normal	Google Omni
`;

const STATUS_MAP: Record<string, CreativeStatus> = {
  "": "BACKLOG",
  scripting: "SCRIPTING",
  editing: "EDITING",
  "needs review": "NEEDS_REVIEW",
  "needs revision": "NEEDS_REVISION",
  ready: "READY",
};

const PRIORITY_MAP: Record<string, CreativePriority> = {
  "": "NORMAL",
  normal: "NORMAL",
  important: "IMPORTANT",
  urgent: "URGENT",
};

/** "7/24/26" or "7/10/2026" → Date (UTC). */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  // Noon UTC: these are calendar dates, and midnight would let any server
  // timezone offset shift them to the previous/next day.
  return new Date(Date.UTC(year, Number(mm) - 1, Number(dd), 12));
}

type ParsedRow = {
  month: string;
  lp: string | null;
  page: string | null;
  strategist: string | null;
  title: string;
  briefLink: string | null;
  editor: string | null;
  videoLink: string | null;
  contentNeeded: boolean;
  status: CreativeStatus;
  priority: CreativePriority;
  aiModel: string | null;
  launchedAt: Date | null;
  cogScore: number | null;
  isWinner: boolean;
};

function parse(block: string, month: string): ParsedRow[] {
  return block
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const c = line.split("\t").map((v) => v.trim());
      const nn = (v: string | undefined) => (v && v.length > 0 ? v : null);
      return {
        month,
        lp: nn(c[0]),
        page: nn(c[1]),
        strategist: nn(c[2]),
        title: c[3] ?? "",
        briefLink: nn(c[4]),
        editor: nn(c[5]),
        videoLink: nn(c[6]),
        contentNeeded: (c[7] ?? "").toLowerCase() !== "no",
        status: STATUS_MAP[(c[8] ?? "").toLowerCase().trim()] ?? "BACKLOG",
        priority: PRIORITY_MAP[(c[9] ?? "").toLowerCase().trim()] ?? "NORMAL",
        aiModel: nn(c[10]),
        launchedAt: parseDate(c[11] ?? ""),
        cogScore: c[12] && /^\d+$/.test(c[12]) ? Number(c[12]) : null,
        isWinner: Boolean(nn(c[13])),
      };
    })
    .filter((r) => r.title.length > 0);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const rows = [...parse(JUNE, "2026-06"), ...parse(JULY, "2026-07")];

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  // Link editors to app users where the names match.
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));

  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    // Key on month + title + briefLink + editor: the sheet legitimately has two
    // different rows sharing a title (e.g. July's two "Statin Side Effects"),
    // so title alone would silently drop one.
    const existing = await prisma.creative.findFirst({
      where: {
        month: r.month,
        title: r.title,
        briefLink: r.briefLink,
        editor: r.editor,
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    if (commit) {
      await prisma.creative.create({
        data: { ...r, editorUserId: r.editor ? (byName.get(r.editor.toLowerCase()) ?? null) : null },
      });
    }
    created++;
  }

  const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Parsed ${rows.length} rows (June ${parse(JUNE, "x").length}, July ${parse(JULY, "x").length})`);
  console.log("By status:", byStatus);
  console.log(`${commit ? "Created" : "Would create"}: ${created}, already present: ${skipped}`);
  if (!commit) console.log("\nDry run — re-run with --commit to write.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
