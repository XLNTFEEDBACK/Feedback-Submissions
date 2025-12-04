import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Follow redirects to get the final URL
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    });

    const finalUrl = response.url;

    // Check if the final URL contains /s- (private track indicator)
    const isPrivate = finalUrl.includes('/s-');

    return NextResponse.json({
      isPrivate,
      finalUrl
    });
  } catch (error) {
    console.error('Error checking SoundCloud URL:', error);
    return NextResponse.json({
      error: 'Failed to check URL',
      isPrivate: false
    }, { status: 500 });
  }
}
