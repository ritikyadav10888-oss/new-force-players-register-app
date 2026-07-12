'use client';

import { use } from 'react';
import TournamentRegistrations from '@/components/TournamentRegistrations';

// Using React.use() to unwrap params since Next.js 15+ expects params to be a Promise
export default function TournamentDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TournamentRegistrations tournamentId={id} backHref="/admin" backLabel="Back to Dashboard" />;
}
