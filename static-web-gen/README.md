# static-web-gen

`dataset/workbook-*.json` から、Hugo で配信するクイズデータと
`/workbook-*/` 用のページを生成します。

## 生成コマンド

`static-web-gen` ディレクトリで実行してください。

```bash
go run . -dataset ../dataset
```

`-dataset` は省略可能です（省略時は `../dataset`）。
既定の生成先は `../site/static/quiz-data/` です。
ページ生成先は `../site/content/workbook/` と `../site/content/post/` です。

## 生成物

- `site/static/quiz-data/index.json`
- `site/static/quiz-data/workbook-*.json`
- `site/static/quiz-data/images/*`（`dataset/images/*` がある場合）
- `site/content/workbook/workbook-*.md`
- `site/content/post/workbook-*.md`

## オプション

```bash
go run . \
  -dataset ../dataset \
  -out ../site/static/quiz-data \
  -content ../site/content/workbook \
  -post-content ../site/content/post
```
