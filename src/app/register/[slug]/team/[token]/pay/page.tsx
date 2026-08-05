import TeamInvitePayClient from '@/components/team-invite/TeamInvitePayClient';

type PageProps = {
  params: Promise<{ slug: string; token: string }>;
};

export default async function TeamInvitePayPage({ params }: PageProps) {
  const { slug, token } = await params;
  return <TeamInvitePayClient slug={slug} token={token} />;
}
