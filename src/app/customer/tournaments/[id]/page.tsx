'use client';

import { use } from 'react';
import TournamentRegistrations from '@/components/TournamentRegistrations';

export default function CustomerTournamentDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <TournamentRegistrations
      tournamentId={id}
      backHref="/customer"
      backLabel="Back to Your Tournaments"
      showPreview={false}
    />
  );
}
