from pathlib import Path

def patch_file(rel: str):
    p = Path(__file__).resolve().parent.parent / rel
    t = p.read_text(encoding="utf-8")
    marker = "<label>Sponsors (optional)</label>"
    mid = t.find(marker)
    if mid == -1:
        raise SystemExit(f"{rel}: marker not found")
    start = t.rfind("\n        <div", 0, mid)
    end = t.find("\n        <motion.div className={styles.formGrid}>", mid)
    if end == -1:
        end = t.find("\n        <div className={styles.formGrid}>", mid)
    if start == -1 or end == -1:
        raise SystemExit(f"{rel}: bounds start={start} end={end}")
    t = t[: start + 1] + "        <SponsorFields sponsors={sponsors} onChange={setSponsors} />\n" + t[end:]
    p.write_text(t, encoding="utf-8")
    print(f"{rel} ok")


patch_file("src/app/admin/tournaments/create/page.tsx")
patch_file("src/app/admin/tournaments/edit/[id]/page.tsx")
