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

export function RegistrationSponsors({ sponsors, variant }: Props) {
  const visible = sponsors.filter(sponsorHasDisplay);
  if (visible.length === 0) return null;

  if (variant === 'form') {
    return (
      <div className={`glass-panel ${styles.sponsorFormStrip}`} role="region" aria-label="Tournament sponsors">
        <p className={styles.sponsorFormHeading}>Our sponsors</p>
        <div className={styles.sponsorFormGrid}>
          {visible.map((s, i) => (
            <div key={i} className={styles.sponsorFormCard}>
              {s.logo ? (
                <span className={styles.sponsorFormLogoBox}>
                  <img src={s.logo} alt="" className={styles.sponsorFormLogo} />
                </span>
              ) : (
                <div className={styles.sponsorFormLogoPlaceholder} aria-hidden />
              )}
              {s.name.trim() ? (
                <span className={styles.sponsorFormName}>{sponsorDisplayName(s)}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const renderRibbonItem = (s: SponsorEntry, key: string) => (
    <div key={key} className={styles.sponsorRibbonItem}>
      {s.logo ? (
        <span className={styles.sponsorRibbonLogoBox}>
          <img src={s.logo} alt="" className={styles.sponsorRibbonLogo} />
        </span>
      ) : null}
      {s.name.trim() ? (
        <span className={styles.sponsorRibbonName}>{sponsorDisplayName(s)}</span>
      ) : null}
    </div>
  );

  return (
    <div className={styles.sponsorMarqueeMask}>
      <div
        className={styles.sponsorMarqueeTrack}
        style={{
          ['--sponsor-marquee-duration' as string]: `${Math.max(1, visible.length)}s`,
        }}
      >
        <div className={styles.sponsorMarqueeRow}>
          {visible.map((s, i) => renderRibbonItem(s, `a-${i}`))}
        </div>
        <div className={styles.sponsorMarqueeRow} aria-hidden>
          {visible.map((s, i) => renderRibbonItem(s, `b-${i}`))}
        </div>
      </div>
    </div>
  );
}
