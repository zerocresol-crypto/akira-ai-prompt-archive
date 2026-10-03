export function threadsPostUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.threads.com' && url.hostname !== 'threads.com') return null;
    if (!/^\/@[a-zA-Z0-9._]+\/post\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    return `https://www.threads.com${url.pathname.replace(/\/$/,'')}`;
  } catch { return null; }
}

export function threadsShareUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.threads.com', 'threads.com'].includes(url.hostname)) return null;
    if (!/^\/share\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    return `https://www.threads.com${url.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}

export const threadsUrl = value => threadsPostUrl(value) || threadsShareUrl(value);

export function normalizeImageReference(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('<')) {
    if (raw.length > 20000) throw Error('Threads埋め込みタグが長すぎます');
    const match = raw.match(/\bdata-text-post-permalink\s*=\s*["']([^"']+)["']/i);
    const url = match && threadsPostUrl(match[1].replace(/&amp;/g,'&'));
    if (!url) throw Error('Threads埋め込みタグの投稿URLを確認してください');
    return url;
  }
  const post = threadsUrl(raw);
  if (post) return post;
  if (raw.length > 2048 || !raw.startsWith('https://') || !URL.canParse(raw)) throw Error('画像URLまたはThreads投稿URLを確認してください');
  return raw;
}

export function threadsEmbed(url) {
  const share = threadsShareUrl(url);
  if (share) return `<p><a href="${share}" target="_blank" rel="noopener noreferrer">Threadsで元の投稿を開く ↗</a></p>`;
  const safe = threadsPostUrl(url);
  if (!safe) return '';
  return `<blockquote class="text-post-media" data-text-post-permalink="${safe}" data-text-post-version="0" style="background:#123448;color:#d7f8ff;border:1px solid #42849b;border-radius:10px;max-width:650px;margin:12px 0;padding:12px;text-align:center"><a href="${safe}" target="_blank" rel="noopener noreferrer" style="color:#d7f8ff;text-decoration:underline;font-weight:600">Threadsで元の投稿を開く ↗</a></blockquote><script async src="https://www.threads.com/embed.js"></script>`;
}
