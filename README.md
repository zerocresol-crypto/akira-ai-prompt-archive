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

`npm install` → D1を作成して `wrangler.jsonc` にIDを設定 → `npm run db:local` → `npm run dev`。本番へのマイグレーションは `npm run db:remote`、デプロイは `npm run deploy`。登録データがない状態では空状態を表示します。

## 管理画面の接続

`/admin` はCloudflare Accessのアプリケーションで保護する。さらにWorker内でAccess JWTの署名、issuer、AUD、有効期限、管理者メールを確認する。次の環境変数が揃うまでは403を返す。

- `ACCESS_TEAM_DOMAIN`：`https://<team>.cloudflareaccess.com`
- `ACCESS_AUD`：AccessアプリケーションのAudienceタグ
- `ADMIN_EMAIL`：登録作業を許可するメールアドレス

Accessポリシーで同じ管理者メールのみ許可する。**管理者画面を保護したAccessアプリケーションをWorkersの公開ホスト全体に適用しないこと**。公開画面は誰でも閲覧できる必要があるため、管理用ホスト名を分けて同じWorkerへルーティングするか、`/admin*` のみにポリシーを適用する。Workerも上記のJWTを検証し、管理操作を拒否する。管理者画面にはシリーズ、曜日、朝・夜・総集編のカット登録とタグ登録がある。画像はカットの編集画面からR2へアップロードするか、HTTPSの画像URLを入力する。タグは `season:autumn:秋` のように1行1件で入力する。

D1作成にはCloudflareにログイン済みのWranglerか適切なAPIトークンが必要。未接続の環境ではDB IDの置換、remote migration、deployは実行できない。公開前に実データ登録とスマートフォンでの表示確認を行う。

## 確認

`npm test` はSQLiteの一時DBでシリーズ→日→カットの登録、下書き非公開、署名済みAccess JWTの検証、タグ検索、無効なタグの拒否を確認する。テストで使う鍵とメールは一時的なダミー値で、実運用の認証情報ではない。

## 日別のまとめ登録

管理画面でシリーズと日別ページを作り、日別ページの「まとめて取り込む」からJSONを貼り付ける。日曜〜金曜は最大6件、総集編は最大3件。各カットは `slot` (`morning` / `evening`、総集編は `recap`)、`cut_number` (1〜3)、`title`、`positive_prompt` が必須。`negative_prompt`、`description`、`aspect_ratio`、`image_url`、`model_name`、`notes`、`tags` は任意。`tags` は `season:autumn:秋` のような文字列の配列にする。

登録したカットはすべて**下書き**になる。既存の時間帯とCut番号があればバッチ全体を取り消し、既存データを上書きしない。登録後に各カットの画像と説明を確認してから公開状態に切り替える。


## 画像の登録

R2が有効なアカウントでは専用バケット `prompt-archive-images` を作成して `IMAGES` にバインドできる。R2未設定時はHTTPSの画像URLを管理画面で登録する。R2を設定した場合、カット編集からJPEG、PNG、WebP（8MB以下）をアップロードすると、ランダムなキーの `/media/art/...` に保存してカットへ紐付ける。画像の形式はファイル名ではなくバイナリ先頭でも確認する。公開画像は同じWorker経由で配信し、OGPでも使う。既存画像の入れ替え時に古い画像を自動削除しないため、将来の保守時に未参照オブジェクトを確認して整理する。

## 最初のシリーズ

`0002_seed_autumn_cafe.sql` は「Autumn Café Collection」のシリーズと2026年10月4〜10日の7日分を**下書き**として登録する。各日のモチーフはアップルパイ、モンブラン、焼き芋ブリュレ、葡萄パフェ、パンプキンラテ、秋色コーヒースタンド、総集編。実際の完全版プロンプト・画像は含めない。管理画面でカットを登録し、内容を確認してから個別カットとシリーズを公開する。
