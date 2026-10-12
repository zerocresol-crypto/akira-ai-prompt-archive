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
    mediaType: String(post.media_type || ''),
    previewUrl: post.media_type === 'IMAGE' ? post.media_url : post.thumbnail_url || ''
  }));
}

export async function threadImages(token, postId, username = 'akira.lether', fetcher = fetch) {
  if (!/^\d+$/.test(postId)) throw Error('投稿IDを確認してください');
  const get = async (id, fields) => {
    const response = await fetcher(`https://graph.threads.net/${id}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error('Threadsの画像を取得できませんでした。投稿またはアクセストークンを確認してください');
    return response.json();
  };
  const post = await get(postId, 'id,username,media_type,media_url,thumbnail_url,children');
  if (post.id !== postId || post.username !== username) throw Error('自分の投稿だけを選択できます');
  const items = post.media_type === 'CAROUSEL_ALBUM'
    ? await Promise.all((post.children?.data || []).slice(0, 20).filter(child => /^\d+$/.test(String(child.id))).map(child => get(child.id, 'id,media_type,media_url,thumbnail_url')))
    : [post];
  return items.filter(item => item.media_type === 'IMAGE' && typeof item.media_url === 'string' && item.media_url.startsWith('https://'))
    .map(item => ({ id: String(item.id), url: item.media_url }));
}
