import {
  sponsorDisplayName,
  sponsorHasDisplay,
  type SponsorEntry,
} from '@/lib/sponsors';
import styles from '@/app/register/[slug]/register.module.css';

type Props = {
  sponsors: SponsorEntry[];
  variant: 'ribbon' | 'form';
};

/** Repeat sponsors so the marquee strip is wide enough on desktop (no clustering at one end). */
function expandForMarquee(items: SponsorEntry[], minCount = 10): SponsorEntry[] {
  if (items.length === 0) return items;
  const out: SponsorEntry[] = [];
  while (out.length < minCount) {
    for (const s of items) {
      out.push(s);
      if (out.length >= minCount) break;
    }
  }
  return out;
}

export function RegistrationSponsors({ sponsors, variant }: Props) {
  const visible = sponsors.filter(sponsorHasDisplay);
  if (visible.length === 0) return null;

  if (variant === 'form') {
    return (
      <div className={`glass-panel ${styles.sponsorFormStrip}`} role="region" aria-label="Tournament sponsors">
        <p className={styles.sponsorFormHeading}>Our sponsors</p>
        <div className={styles.sponsorFormGrid}>
          {visible.map((s, i) => {
            const name = sponsorDisplayName(s);
            const initial = name.trim().charAt(0).toUpperCase() || '?';
            return (
              <div key={i} className={styles.sponsorFormCard}>
                <span className={styles.sponsorFormLogoBox}>
                  {s.logo ? (
                    <img src={s.logo} alt="" className={styles.sponsorFormLogo} />
                  ) : (
                    <span className={styles.sponsorFormLogoInitial} aria-hidden>
                      {initial}
                    </span>
                  )}
                </span>
                {name.trim() ? <span className={styles.sponsorFormName}>{name}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const renderRibbonItem = (s: SponsorEntry, key: string) => {
    const name = sponsorDisplayName(s);
    const initial = name.trim().charAt(0).toUpperCase() || '?';
    return (
      <div key={key} className={styles.sponsorRibbonItem}>
        <span className={styles.sponsorRibbonLogoBox}>
          {s.logo ? (
            <img src={s.logo} alt="" className={styles.sponsorRibbonLogo} />
          ) : (
            <span className={styles.sponsorRibbonLogoInitial} aria-hidden>
              {initial}
            </span>
          )}
        </span>
        {name.trim() ? <span className={styles.sponsorRibbonName}>{name}</span> : null}
      </div>
    );
  };

  const loopItems = expandForMarquee(visible);
  const marqueeSeconds = Math.max(loopItems.length * 3, 24);

  return (
    <div className={styles.sponsorMarqueeMask}>
      <div
        className={styles.sponsorMarqueeTrack}
        style={{
          ['--sponsor-marquee-duration' as string]: `${marqueeSeconds}s`,
        }}
      >
        <div className={styles.sponsorMarqueeRow}>
          {loopItems.map((s, i) => renderRibbonItem(s, `a-${i}`))}
        </div>
        <div className={styles.sponsorMarqueeRow} aria-hidden>
          {loopItems.map((s, i) => renderRibbonItem(s, `b-${i}`))}
        </div>
      </div>
    </div>
  );
}
