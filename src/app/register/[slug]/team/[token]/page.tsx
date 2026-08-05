import TeamInvitePlayerClient from '@/components/team-invite/TeamInvitePlayerClient';

type PageProps = {
  params: Promise<{ slug: string; token: string }>;
};

export default async function TeamInvitePlayerPage({ params }: PageProps) {
  const { slug, token } = await params;
  return <TeamInvitePlayerClient slug={slug} token={token} />;
}
