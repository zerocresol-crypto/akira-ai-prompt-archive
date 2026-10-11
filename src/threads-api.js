import { threadsPostUrl } from './threads.js';

export async function listOwnThreads(token, username = 'akira.lether', fetcher = fetch) {
  if (!token) throw Error('Threads APIのアクセストークンが未設定です');
  const endpoint = 'https://graph.threads.net/me/threads?fields=id,username,permalink,text,timestamp,media_type,media_url,thumbnail_url,children&limit=50';
  const response = await fetcher(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error('Threads APIから投稿を取得できませんでした。接続設定またはトークンの有効期限を確認してください');
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw Error('Threads APIの応答を確認できませんでした');
  return payload.data.filter(post =>
    post.username === username &&
    typeof post.id === 'string' && /^\d+$/.test(post.id) &&
    threadsPostUrl(post.permalink)
  ).map(post => ({
    id: post.id,
    permalink: threadsPostUrl(post.permalink),
    text: String(post.text || '').slice(0, 500),
    timestamp: String(post.timestamp || ''),
    mediaType: String(post.media_type || '')
  }));
}
