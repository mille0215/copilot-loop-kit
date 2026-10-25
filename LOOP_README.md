# ループエンジニアリング最小構成（VS Code + GitHub Copilot）

人間が毎回プロンプトを打つ代わりに、**「目標 → 実装 → 検証 → 記録」を回す仕組み**をリポジトリに置く構成です。

## 仕組み

```
人間: loop/GOAL.md を書く → チャットで /loop
          │
          ▼
  ┌──────────────── Loop エージェント ────────────────┐
  │ STATE.md から次のタスクを1つ選ぶ                     │
  │   → 実装 → verify 実行 → 失敗なら修正 → STATE.md 記録 │
  └──────────────────────┬───────────────────────────┘
                         │ 止まろうとする
                         ▼
        Stop フック（stop-gate.mjs）が verify を再実行
          ├ 失敗 or 未完了タスクあり → 終了をブロックして次の周回へ
          ├ 上限周回に到達           → 強制停止
          └ 成功 & 全タスク完了      → 終了
```

ループに必要な要素とこの構成の対応:

| 要素 | 役割 | ファイル |
|---|---|---|
| 目標と完了条件 | 何をもって「終わり」とするか | `loop/GOAL.md`（人間が書く） |
| 記憶 | 周回をまたいで進捗と学びを持ち越す | `loop/STATE.md`（エージェントが書く） |
| 手順 | 1周回の進め方 | `.github/agents/loop.agent.md` |
| 検証 | 機械的な合否判定 | `loop/loop.config.json` の `verify` |
| 継続 | 未完了なら止まらせない | `scripts/hooks/stop-gate.mjs` |
| 停止条件 | 無限ループ・コスト暴走の防止 | `maxIterations`（既定 8） |
| ガードレール | 危険操作と採点基準の改ざん防止 | `scripts/hooks/pre-tool-guard.mjs` |
| 独立検査 | 自己採点にしない | `.github/agents/reviewer.agent.md` |

## 導入手順

1. このフォルダの中身をリポジトリのルートにコピーする（`.github` `.vscode` `loop` `scripts` `.gitignore`）。既存の `.vscode/settings.json` や `.gitignore` がある場合は中身をマージする。
2. Node.js が入っていることを確認する（フックが `node` で動くため）。
3. `loop/loop.config.json` の `verify` をプロジェクトの検証コマンドに変える。
   例: `"npm run lint && npm test"`、`"dotnet test"`、`"pytest -q"`
   → `.vscode/settings.json` の `chat.tools.terminal.autoApprove` も同じコマンドに合わせる。
4. VS Code でワークスペースを「信頼」する（信頼されていないとフックは動かない）。
5. チャットの右クリック → **Diagnostics** で、エージェント・プロンプト・フックが読み込まれているか確認する。

## 使い方

1. `loop/GOAL.md` に目的・完了条件・触ってよい範囲を書く。**完了条件はテストやコマンドで判定できる形にする**のが最重要。
2. `loop/STATE.md` を初期状態に戻す（前回の内容が残っていれば消す）。
3. Copilot Chat で `/loop` を実行する。
4. 終わったら `Reviewer` の判定と `git diff` を人間が確認してコミットする。

## 調整ポイント

- **コスト**: Stop フックで継続した周回もクレジットを消費します。最初は `maxIterations` を 3〜5 にして挙動を見てから上げてください。
- **タスクの粒度**: 1周回で verify が通る大きさに分けるほど安定します。大きすぎると同じエラーで周回を浪費します。
- **ハーネス差異**: VS Code ではハーネス（Local / Copilot など）によってフックの入出力形式や `handoffs` の対応が異なります。`stop-gate.mjs` は両方の形式で返していますが、止まらない・継続しない場合はチャットのデバッグログでフックの入出力を確認してください。
- **ガードの限界**: `pre-tool-guard.mjs` はツール引数の文字列を正規表現で見ているだけの簡易版です。本格運用ではブランチ保護・CI 側の検証と併用してください。
