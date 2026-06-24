export const dynamic = 'force-static';

const BODY = `Contact: https://github.com/sarthakagrawal927/starboard/security/advisories/new
Contact: mailto:sarthakagrawal927@gmail.com
Preferred-Languages: en
Expires: 2027-05-15T00:00:00Z
Canonical: https://starboard.workers.dev/.well-known/security.txt
`;

export function GET() {
  return new Response(BODY, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
