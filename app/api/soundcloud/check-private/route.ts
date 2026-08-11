import { NextRequest, NextResponse } from 'next/server';
import { parseTrackLink } from '@/lib/track-links';

const extractIframeSrc = (html?: string | null) => {
  if (!html) return null;
  const match = html.match(/\ssrc=(["'])(.*?)\1/i);
  return match?.[2]?.replace(/&amp;/g, '&') ?? null;
};

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (typeof url !== 'string' || url.trim().length === 0) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const soundcloudUrl = url.trim();
    const parsedTrack = parseTrackLink(soundcloudUrl);
    if (!parsedTrack.valid || parsedTrack.provider !== 'soundcloud') {
      return NextResponse.json(
        { error: 'A valid SoundCloud URL is required' },
        { status: 400 },
      );
    }

    // Follow redirects to get the final URL
    let response = await fetch(parsedTrack.trackUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });

    // Some shared links may not behave well with HEAD; retry with GET.
    if (!response.url || response.url === parsedTrack.trackUrl) {
      response = await fetch(parsedTrack.trackUrl, {
        method: 'GET',
        redirect: 'follow',
      });
    }

    const finalUrl = response.url || parsedTrack.trackUrl;
    let embedUrl: string | null = null;

    try {
      const oembedUrl = new URL('https://soundcloud.com/oembed');
      oembedUrl.searchParams.set('format', 'json');
      oembedUrl.searchParams.set('url', finalUrl);

      const oembedResponse = await fetch(oembedUrl.toString(), {
        cache: 'no-store',
      });

      if (oembedResponse.ok) {
        const oembedData: { html?: string } = await oembedResponse.json();
        embedUrl = extractIframeSrc(oembedData.html);
      }
    } catch (error) {
      console.error('Error resolving SoundCloud oEmbed URL:', error);
    }

    // Check if the final URL contains /s- (private track indicator)
    const isPrivate =
      finalUrl.includes('/s-') ||
      Boolean(embedUrl && new URL(embedUrl).searchParams.has('secret_token'));

    return NextResponse.json({
      isPrivate,
      finalUrl,
      embedUrl,
    });
  } catch (error) {
    console.error('Error checking SoundCloud URL:', error);
    return NextResponse.json({
      error: 'Failed to check URL',
      isPrivate: false,
      embedUrl: null,
    }, { status: 500 });
  }
}
