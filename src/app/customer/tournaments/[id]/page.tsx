'use client';

import { use } from 'react';
import Link from 'next/link';
import TournamentRegistrations from '@/components/TournamentRegistrations';

export default function CustomerTournamentDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <Link
          href={`/admin/tournaments/edit/${id}`}
          className="btn-secondary"
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', textDecoration: 'none' }}
        >
          Edit tournament
        </Link>
      </div>
      <TournamentRegistrations
        tournamentId={id}
        backHref="/customer"
        backLabel="Back to Your Tournaments"
        showPreview={false}
      />
    </div>
  );
}
