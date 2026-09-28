# Cloudflare公開手順（初回）

このサイト専用のCloudflare D1を使う。R2はアカウントで有効化された後に追加できる。別サイトのDB、バケット、ドメインを流用しない。以下はWindows PowerShellでリポジトリのルートから実行する。Cloudflareの認証情報はGitHubや会話へ貼らない。

## 1. 作業環境

```powershell
git clone https://github.com/zerocresol-crypto/akira-ai-prompt-archive.git
cd akira-ai-prompt-archive
npm install
npm test
npx wrangler login
npx wrangler whoami
```

`whoami` のアカウントを確認する。ログイン後、Prompt Archive専用のリソースを作る。

## 2. D1

R2は現在のアカウントで未有効化（Cloudflareエラー10042）のため、バケット作成を飛ばして進める。

作成済みのD1 IDは `wrangler.jsonc` に反映済み。先に `git pull` で最新版を取得する。D1を重複作成しない。

```powershell
npm run check:deploy
npm run db:local
npm run db:remote
npm run db:verify
```

確認プロンプトが出たら適用対象のDB名と2件のマイグレーションを見て承認する。`db:verify` に `series`、`days`、`prompts`、`tags`、`prompt_tags` が表示されるまでWorkerの確認へ進まない。マイグレーションは `0001`（スキーマ）と `0002`（Autumn Café Collectionの下書き）を適用する。`--remote` の対象が専用DBであることを確認する。データや画像がまだない段階ではサイトは空状態になる。

## 3. Worker

```powershell
npm run deploy
```

表示された `workers.dev` URLで公開画面を確認する。`/admin` はこの時点では403になる設計。管理機能を有効にする前にCloudflare Zero Trustで管理画面用のAccessアプリケーションを作成し、管理するメールアドレスだけを許可する。公開ページをAccessの認証対象に含めない。Accessが発行するJWTのAudience Tag、チームドメイン、管理者メールを確認し、Workerの環境変数 `ACCESS_AUD`、`ACCESS_TEAM_DOMAIN`、`ADMIN_EMAIL` に登録する。これらが揃わない間、Workerは管理操作を拒否する。

画像URL、下書き公開、スマートフォン表示、コピー、OGPの確認後に独立したドメインを設定する。R2未設定時は画像アップロードフォームを表示せず、各カットにHTTPS画像URLを登録する。aoiro-kirinuki.jp系のサイトとはリンクしない。

## 現在の状態

D1 `prompt-archive` の作成と実UUIDの設定は完了。R2は有効化されておらず、Workerの必須bindingから外した。本番マイグレーション、Access設定、Worker公開はまだ確認できていない。上記のコマンドは準備用であり、この文書を置いただけでは公開されない。

## R2を後から有効化する場合

CloudflareダッシュボードからR2を有効化した後、`npx wrangler r2 bucket create prompt-archive-images` を実行する。`wrangler.jsonc` に `"r2_buckets": [{"binding":"IMAGES","bucket_name":"prompt-archive-images"}]` を追加して再デプロイすると、管理画面の画像アップロードが使用できる。R2の有効化に課金情報の入力が必要な場合は、Cloudflareの条件を確認してから判断する。

## 管理画面を有効化する

公開Workerの `workers.dev` にAccessを有効化すると、閲覧者もログインを求められる。代わりに**管理専用Worker**を使う。公開Worker `/admin` は404、管理Workerでは管理ルート以外を404にする。両WorkerはPrompt Archive専用の同じD1を参照する。

リポジトリの最新版を取得して、次を実行する。

```powershell
git pull
npm test
npm run deploy
npm run deploy:admin
```

管理WorkerのURLは `https://akira-ai-prompt-archive-admin.zero-cresol.workers.dev/` になる想定。初回は未設定のため `/admin` が403になる。この状態でCloudflareダッシュボードの **Workers & Pages → akira-ai-prompt-archive-admin → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access** に進み、**管理Workerのproduction URLだけ**を保護する。管理者のメールアドレスだけを許可する。公開Worker `akira-ai-prompt-archive` にAccessを設定しない。

AccessアプリケーションのAudience (AUD) Tag とチームドメインを確認し、管理Workerに必要な3値を登録する。値は実際の環境に合わせてCLIの対話入力欄へ入力する（コマンドやGitHubへ値を直書きしない）。

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.admin.jsonc
npx wrangler secret put ACCESS_AUD --config wrangler.admin.jsonc
npx wrangler secret put ADMIN_EMAIL --config wrangler.admin.jsonc
```

`ACCESS_TEAM_DOMAIN` は `https://<team>.cloudflareaccess.com` の形、`ACCESS_AUD` は管理WorkerのAccessアプリケーションのAUDタグ、`ADMIN_EMAIL` は許可した管理者メール。3値が揃わない場合、Workerは管理画面へのアクセスを拒否する。設定後に管理Worker `/admin` を開き、認証できることを確認する。公開Workerのトップとシリーズ一覧はログインなしで開けることを別ウィンドウでも確認する。
