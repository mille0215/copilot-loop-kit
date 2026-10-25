# GOAL（人間が書く。エージェントは編集しない）

## 目的
<!-- 例: 社員マスタCRUD APIに「部署で絞り込む」検索条件を追加する -->

## 完了条件（すべて機械的に確認できること）
- [ ] `loop/loop.config.json` の verify コマンドが成功する
- [ ] <!-- 例: GET /employees?dept=xxx のテストが追加され、通る -->
- [ ] <!-- 例: 既存APIのレスポンス形式を変えていない -->

## 制約
- 触ってよい範囲: <!-- 例: src/employees/, tests/employees/ -->
- 触ってはいけない範囲: `.github/hooks/`, `scripts/hooks/`, `loop/loop.config.json`, `loop/GOAL.md`
- 新しい依存パッケージの追加: 禁止（必要なら STATE.md の「人間への質問」に書いて止まる）

## 参考
<!-- 仕様書、関連ファイル、Issue など -->
