import { ImageResponse } from 'next/og';

/**
 * Dynamically generated OG / share-card image for the site root.
 * Next.js serves this at `/opengraph-image` and wires it into the page's
 * OpenGraph + Twitter card metadata automatically. No binary asset to ship.
 */
export const alt = 'Starboard — Tool intelligence for your GitHub projects';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: '#0a0a0a',
        color: '#fafafa',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '14px',
            background: '#2563eb',
            color: '#ffffff',
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          S
        </div>
        <div style={{ fontSize: 40, fontWeight: 700 }}>Starboard</div>
      </div>
      <div
        style={{
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop: '40px',
          maxWidth: '900px',
        }}
      >
        Find better tools for the project you are building.
      </div>
      <div
        style={{
          fontSize: 32,
          color: '#a1a1aa',
          marginTop: '28px',
          maxWidth: '880px',
        }}
      >
        Find similar repositories, then trace suggested tools to the peers that actually use them.
      </div>
    </div>,
    { ...size }
  );
}
