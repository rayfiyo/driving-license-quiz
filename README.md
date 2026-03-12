# driving-license-quiz

- 運転免許のための問題集
- Questions for driving license

## Directory Layout

- `site/`: GitHub Pages で配信する Hugo サイト本体
- `static-web-gen/`: 外部 dataset から `site/` 向けデータ/ページを生成するツール
- `.github/workflows/pages.yml`: private `musasi2json` を checkout して build する Workflow

このリポジトリは `dataset/` を正として保持せず、Workflow 実行時に
`rayfiyo/musasi2json` の `dataset/` を利用します。

## GitHub Actions Setup (Private Dataset Repo)

このリポジトリの Pages Workflow は、private な `rayfiyo/musasi2json` を checkout して
`-dataset` に `../.musasi2json/dataset` を渡して生成します。

必要な設定:

1. `rayfiyo/musasi2json` を読める Personal Access Token を作成する
   - fine-grained PAT 推奨
   - Repository permissions: `Contents: Read`
2. `driving-license-quiz` の GitHub 設定で Actions Secret を追加する
   - `Settings > Secrets and variables > Actions`
   - Secret 名: `MUSASI2JSON_READ_TOKEN`
   - 値: 手順1で作成した PAT

補足:

- リポジトリ間アクセスには `GITHUB_TOKEN` だけでは不十分なため、上記 Secret が必要です。
