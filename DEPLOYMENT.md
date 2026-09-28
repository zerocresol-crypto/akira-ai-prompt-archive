# Cloudflare公開手順（初回）

このサイト専用のCloudflare D1とR2を使う。別サイトのDB、バケット、ドメインを流用しない。以下はWindows PowerShellでリポジトリのルートから実行する。Cloudflareの認証情報はGitHubや会話へ貼らない。

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

## 2. D1とR2

```powershell
npx wrangler r2 bucket create prompt-archive-images
```

作成済みのD1 IDは `wrangler.jsonc` に反映済み。先に `git pull` で最新版を取得する。D1を重複作成しない。

```powershell
npm run check:deploy
npm run db:local
npm run db:remote -- --yes
```

マイグレーションは `0001`（スキーマ）と `0002`（Autumn Café Collectionの下書き）を適用する。`--remote` の対象が専用DBであることを確認する。データや画像がまだない段階ではサイトは空状態になる。

## 3. Worker

```powershell
npm run deploy
```

表示された `workers.dev` URLで公開画面を確認する。`/admin` はこの時点では403になる設計。管理機能を有効にする前にCloudflare Zero Trustで管理画面用のAccessアプリケーションを作成し、管理するメールアドレスだけを許可する。公開ページをAccessの認証対象に含めない。Accessが発行するJWTのAudience Tag、チームドメイン、管理者メールを確認し、Workerの環境変数 `ACCESS_AUD`、`ACCESS_TEAM_DOMAIN`、`ADMIN_EMAIL` に登録する。これらが揃わない間、Workerは管理操作を拒否する。

画像アップロード、下書き公開、スマートフォン表示、コピー、OGPの確認後に独立したドメインを設定する。aoiro-kirinuki.jp系のサイトとはリンクしない。

## 現在の状態

D1 `prompt-archive` の作成と実UUIDの設定は完了。R2作成、本番マイグレーション、Access設定、Worker公開はまだ確認できていない。上記のコマンドは準備用であり、この文書を置いただけでは公開されない。
