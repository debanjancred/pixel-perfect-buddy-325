/** The demo acts as the collector (SPEC 2.1); suites that do admin work switch first. */
export async function demoAsAdmin(page) {
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("pk_db_v2"));
    const club = db.clubs.find((c) => c.id === db.active_club_id);
    const admin = db.members.find((m) => m.club_id === club.id && m.role === "admin");
    localStorage.setItem("pk_session_v1", JSON.stringify({ mode: "demo", member_id: admin.id }));
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
}
