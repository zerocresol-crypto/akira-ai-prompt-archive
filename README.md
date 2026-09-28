# AIイラスト Prompt Archive

Threads [@akira.lether](https://www.threads.com/@akira.lether) のAIイラスト用プロンプトを公開する独立サイト。VTuber関連サイトやデータとの連携はありません。

## v1.0 設計

| 画面 | パス | 内容 |
| --- | --- | --- |
| トップ | `/` | 最新シリーズ、追加プロンプト、タグ |
| シリーズ一覧 | `/series` | 公開シリーズ一覧 |
| シリーズ詳細 | `/series/:slug` | コンセプト、制作期間、曜日一覧 |
| 日別 | `/series/:slug/:day` | 朝・夜の各3カット、土曜は総集編 |
| プロンプト詳細 | `/series/:slug/:day/:slot/:cut` | 画像、制作意図、Positive/Negative、コピー、OGP |
| 管理画面 | `/admin` | 次工程で実装。認証後にシリーズ・日付・カット・タグを編集 |

D1の `series → days → prompts` に `tags` を多対多で結びます。曜日は公開順序 `0=日曜 … 6=総集編`、時間帯は `morning/evening/recap`、カット番号は1〜3。下書きは公開ルートから除外します。画像URLは将来R2へ移せるよう文字列で保持します。画像なしでも公開UIが成立します。

## 実装の順番

1. このリポジトリに公開UIとD1スキーマを置く（今回）
2. D1作成・binding設定、ローカルと本番にmigration適用
3. 管理画面と認証、入力検証、下書き・公開制御、画像アップロード
4. 最初のシリーズを登録し、実際のプロンプトと画像で確認
5. Cloudflareへ公開し、スマートフォン、コピー、OGP、共有URLを確認
6. タグ検索と運用改善を順次追加

管理画面はCloudflare Access等のアクセス制御に加え、Worker側でも認証済みユーザーを検証する構成を採用します。公開前に認証方式と管理者のメールを確定します。秘密情報と画像の元データはGitHubに含めません。

## 開発

`npm install` → D1を作成して `wrangler.jsonc` のIDを置換 → `npm run db:local` → `npm run dev`。本番へのマイグレーションは `npm run db:remote`、デプロイは `npm run deploy`。登録データがない状態では空状態を表示します。
