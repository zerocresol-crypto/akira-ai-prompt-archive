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

## 管理画面を有効化する（Zero Trust登録不要）

公開Worker `/admin` は404、管理専用Workerでは管理画面以外を404にする。両方ともPrompt Archive専用の同じD1を参照する。管理Workerは64文字のランダムな16進パスワードをCloudflare Worker Secretで検証する。Zero Trust Freeの決済情報登録は不要。

```powershell
git pull
npm test
npm run deploy:admin
```

自分のPCで次のコマンドを実行してパスワードを作成し、**パスワード管理ツールへ保存**する。値を会話・GitHub・スクリーンショットへ載せない。

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put ADMIN_PASSWORD --config wrangler.admin.jsonc
```

2行目の対話入力欄に、生成した64文字を貼り付ける。Worker Secretは公開リポジトリや設定ファイルへ書かない。設定後、`https://akira-ai-prompt-archive-admin.zero-cresol.workers.dev/admin` を開く。ブラウザーの認証ダイアログに**ユーザー名 `admin`** と保存したパスワードを入力する。一般公開サイト `https://akira-ai-prompt-archive.zero-cresol.workers.dev/` はログイン不要のまま開く。

パスワードを紛失した場合は新たに生成して `ADMIN_PASSWORD` Secretを上書きする。以前のパスワードは使えなくなる。Zero Trustを後から導入する場合も管理Workerのみを保護し、公開Workerに設定しない。
