# Cloudflare公開手順（初回）

## URLを匿名の名前に切り替える（準備中）

目標URLは公開 `https://prompt-archive.atelier-notes.workers.dev/`、管理 `https://prompt-archive-admin.atelier-notes.workers.dev/admin`。Cloudflareの `atelier-notes` が利用可能な場合に限る。空き状況を確認するまではアカウントのサブドメインを変更しない。

Cloudflareの Workers & Pages に表示されるWorker一覧と、各Workerのカスタムドメインの有無を確認する。アカウント共通の `workers.dev` サブドメイン変更は他のWorkerのURLにも影響する。既存URLの利用先（リンク、監視、ブックマーク）を記録する。変更前にD1のバックアップを確認する。

1. Cloudflare Workers & Pages の「Your subdomain」→「Change」で `atelier-notes` の空きを確認し、他のWorkerへの影響を確認してから変更する。この時点では旧Worker名が付いたURLで既存サイトが稼働する。
2. このブランチを `main` に反映するとGitHub Actionsが新しい公開・管理Workerを作成する。両方とも既存のD1 `prompt-archive` を参照する。旧Workerは残す。新しい管理Workerには `ADMIN_PASSWORD` Secretがないため、設定するまで管理画面は503になる。
3. パスワード管理ツールに保存済みの既存パスワードを、PCで `npx wrangler secret put ADMIN_PASSWORD --config wrangler.admin.jsonc` に入力して新管理Workerへ登録する。新しいパスワードに変える場合は64文字のランダムな値を生成して保存する。SecretをGitHubや会話へ載せない。
4. 新URLで公開トップ（200）、下書きシリーズ（404）、公開側の `/admin`（404）、管理側の未認証 `/admin`（401）、正しいパスワードでの日別編集・保存を確認する。公開ページの画像URL・OGP・共有リンクも確認する。
5. 新URLを利用するリンク・監視・ブックマークを更新する。旧Workerの停止は新URLと管理編集の確認後に行う。旧Workerを削除する前にSecretやD1設定を確認し、D1本体は削除しない。

`workers.dev` のアカウントサブドメイン変更は旧WorkerのURLにも同時に反映されるため、旧サブドメインURLを恒久的な転送先として扱わない。

## スマートフォンからの更新

プロンプト・画像URL・タグの登録は管理Workerの `/admin` から行う。D1へ直接保存されるので、GitHub更新やWorkerデプロイは不要。

コードの更新は `.github/workflows/deploy.yml` で自動デプロイできる。最初にGitHubリポジトリの Settings → Secrets and variables → Actions へ、Repository secrets として `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録する。Cloudflareの Account API tokens で、対象アカウントだけに限定した「Edit Cloudflare Workers」トークンを作る。トークンをコード・会話・スクリーンショットへ貼らない。`ADMIN_PASSWORD` は引き続き管理WorkerのSecretに置き、GitHubへ移さない。

設定後は `main` のコード更新でテストが実行され、公開Worker→管理Workerの順にデプロイされる。スマホからはGitHubの Actions → Deploy Prompt Archive → Run workflow で手動再実行も可能。結果はActions画面で確認する。初回設定前のWorkflowは認証情報不足で失敗するが、現在稼働中のWorkerは変わらない。D1マイグレーションは自動実行しない。新しいマイグレーションが必要なリリースでは先に `npm run db:remote` を実行する。

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

2行目の対話入力欄に、生成した64文字を貼り付ける。Worker Secretは公開リポジトリや設定ファイルへ書かない。設定後、`https://prompt-archive-admin.atelier-notes.workers.dev/admin` を開く。ブラウザーの認証ダイアログに**ユーザー名 `admin`** と保存したパスワードを入力する。一般公開サイト `https://prompt-archive.atelier-notes.workers.dev/` はログイン不要のまま開く。

パスワードを紛失した場合は新たに生成して `ADMIN_PASSWORD` Secretを上書きする。以前のパスワードは使えなくなる。Zero Trustを後から導入する場合も管理Workerのみを保護し、公開Workerに設定しない。
