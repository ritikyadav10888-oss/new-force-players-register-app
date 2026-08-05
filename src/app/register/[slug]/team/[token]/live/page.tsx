import TeamInviteLiveClient from '@/components/team-invite/TeamInviteLiveClient';

type PageProps = {
  params: Promise<{ slug: string; token: string }>;
};

export default async function TeamInviteLivePage({ params }: PageProps) {
  const { slug, token } = await params;
  return <TeamInviteLiveClient slug={slug} token={token} />;
}
