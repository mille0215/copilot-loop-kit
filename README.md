# ループエンジニアリング最小構成（VS Code + GitHub Copilot）

人間が毎回プロンプトを打つ代わりに、**「目標 → 実装 → 検証 → 記録」を回す仕組み**をリポジトリに置く構成です。

## 仕組み

```
人間: loop/GOAL.md を書く → チャットで /loop
          │
          ▼
  Loop エージェント: node scripts/loop/start.mjs でループ開始（loop/.run/active.json を作成）
          │
  ┌──────────────── 1周回 ────────────────────────────────┐
  │ STATE.md から次のタスクを1つ選ぶ → 実装 → verify 実行       │
  │   → 失敗なら修正 → STATE.md 記録 → checkpoint.mjs でコミット │
  │ 全タスク完了なら snapshot.mjs → Reviewer → 判定を記録       │
  └──────────────────────┬────────────────────────────────┘
                         │ 止まろうとする
                         ▼
        Stop フック（stop-gate.mjs）
          ├ 周回 / ツール呼び出しの上限に到達 → 強制停止
          ├ 「人間への質問」が未回答         → 停止（未完了として報告）
          ├ verify 失敗 / 未完了タスク / レビュー未完了・古い → ブロックして次の周回へ
          └ verify 成功 & 全タスク完了 & レビュー OK → 終了
```

ループを終えるかどうかは、すべて終了ゲートが判定します。エージェントは `loop/.run/` を触れないため、自分でループを抜けることはできません。

ループに必要な要素とこの構成の対応:

| 要素 | 役割 | ファイル |
|---|---|---|
| 目標と完了条件 | 何をもって「終わり」とするか | `loop/GOAL.md`（人間が書く） |
| 記憶 | 周回をまたいで進捗と学びを持ち越す | `loop/STATE.md`（エージェントが書く。雛形は `loop/STATE.template.md`） |
| 手順 | 1周回の進め方 | `.github/agents/loop.agent.md` |
| 検証 | 機械的な合否判定 | `loop/loop.config.json` の `verify` |
| 継続 | 未完了なら止まらせない | `scripts/hooks/stop-gate.mjs` |
| 停止条件 | 無限ループ・コスト暴走の防止 | `maxIterations`（既定 8）・`maxToolCalls`（既定 200） |
| ガードレール | 危険操作と採点基準の改ざん防止 | `scripts/hooks/pre-tool-guard.mjs` |
| 独立検査 | 自己採点にしない | `.github/agents/reviewer.agent.md` ＋ `scripts/loop/snapshot.mjs` |
| 巻き戻し | 周回ごとに戻れる地点を作る | `scripts/loop/checkpoint.mjs`（ローカルコミットのみ。push しない） |

## 導入手順

1. このリポジトリの中身を対象リポジトリのルートにコピーする（`.github` `.vscode` `loop` `scripts` `.gitignore`）。既存の `.vscode/settings.json` や `.gitignore` がある場合は中身をマージする。Python のプロジェクトなら、続けて「[Python で使う場合](#python-で使う場合)」の手順も行う。
2. Node.js 22 以上が入っていることを確認する（フックとスクリプトが `node` で動くため）。
3. `loop/loop.config.json` を調整する。
   - `verify` をプロジェクトの検証コマンドに変える。例: `"npm run lint && npm test"`、`"dotnet test"`、`"pytest -q"`
     → `.vscode/settings.json` の `chat.tools.terminal.autoApprove` も同じコマンドに合わせる。
   - `protectedPaths` に、verify の結果を左右するファイル（テストランナーの設定、スナップショットなど）を足す。既定では `package.json`・lock ファイル・主要なテスト設定が入っている。
4. ビルドやテストの生成物（カバレッジなど）が `.gitignore` に入っていることを確認する。入っていないと、verify のたびに差分が変わり、レビューのやり直しを求められ続けます。
5. VS Code でワークスペースを「信頼」する（信頼されていないとフックは動かない）。
6. チャットの右クリック → **Diagnostics** で、エージェント・プロンプト・フックが読み込まれているか確認する。
7. 動作確認として `node --test "scripts/hooks/tests/*.test.mjs"` を実行する。

## Python で使う場合

ループの仕組みは言語に依存しません。`presets/python/` に設定例があります。フックは Node.js で動くので、Python のプロジェクトでも Node.js 22 以上が必要です。

1. `presets/python/loop.config.json` で `loop/loop.config.json` を置き換える。
   - verify は `ruff check` と `pytest` を仮想環境（`.venv`）の python で実行します。**フックは仮想環境を有効化せずに verify を実行する**ので、`pytest` ではなく `.venv\Scripts\python -m pytest` のようにパスで指定してください。macOS / Linux では `.venv/bin/python` にします。
   - `protectedPaths` に `pyproject.toml`・`requirements*.txt`・lock ファイル・`tests/**` などが入っています。`pyproject.toml` には pytest の設定と依存の一覧があるため、保護しないと「テストを対象から外す」「依存を足す」ことで検証を通せてしまいます。
2. `presets/python/settings.json` の `chat.tools.terminal.autoApprove` を `.vscode/settings.json` にマージする。
3. `presets/python/gitignore` の内容を `.gitignore` に追記する（`__pycache__` やキャッシュを無視しないと、レビューのやり直しを求められ続けます）。
4. ruff・pytest など verify に必要な道具は、**ループを始める前に人間が仮想環境に入れておく**。ループ中は依存を追加できません。

ガードが拒否する依存追加: `pip install <パッケージ>`（`python -m pip`・`uv pip` も含む）、`uv add`・`poetry add`・`pdm add`・`pipenv install <パッケージ>`・`conda install`。宣言済みの依存を入れるだけの `pip install -r requirements.txt`・`pip install -e .`・`uv sync`・`poetry install` は許可されます。

完了条件は pytest で判定できる形にします。Web API（FastAPI / Flask）は `TestClient` で、CLI は `subprocess` で実行して出力と終了コードを確かめます。GUI はロジックを別モジュールに分け、そのテストを完了条件にしてください。

## 使い方

1. `loop/GOAL.md` に目的・完了条件・触ってよい範囲を書く。**完了条件はテストやコマンドで判定できる形にする**のが最重要。
2. ループ開始前の変更はコミットしておく（未コミットの変更があると、その回はチェックポイントコミットが無効になります）。
3. Copilot Chat で `/loop` を実行する。STATE.md は、前回のタスクが残っていれば続きから、なければ雛形に戻して新規に始まります。
4. 終わったら、STATE.md の「レビュー」欄と `git log` / `git diff <開始時のコミット>` を人間が確認する。チェックポイントコミットは `[loop]` で始まるので、必要に応じてまとめ直す（squash する）。

### 「人間への質問」で止まったとき

STATE.md の「人間への質問」に回答を書き添えて `- [x]` にする（または行を消す）。それから `/loop` で再開します。

### ループが異常終了して「既に実行中」と言われるとき

VS Code が落ちた場合などに `loop/.run/active.json` が残ることがあります。人間が `loop/.run/` を削除してください（`staleHours` 時間が経てば自動で無視されます）。

## 保護されるファイル

次のものは、Copilot のツール経由では編集できません（`pre-tool-guard.mjs` が拒否します）。人間はエディタで直接編集してください。Copilot に編集させたい場合は、一時的に `chat.useHooks` を `false` にします。

- `.github/` の `hooks/`・`agents/`・`prompts/`・`instructions/`・`copilot-instructions.md`
- `.vscode/`
- `scripts/hooks/`・`scripts/loop/`
- `loop/loop.config.json`・`loop/GOAL.md`・`loop/STATE.template.md`・`loop/.run/`
- `loop/loop.config.json` の `protectedPaths` に挙げたもの

保護ファイルを読むだけのシェルコマンド（`cat`・`Get-Content`・`git diff` など）と、テストの実行（`pytest`・`python -m pytest`・`node --test`・`npm test` など）は、保護ファイルを指定していても許可されます。

## 設定項目（`loop/loop.config.json`）

| 項目 | 既定 | 意味 |
|---|---|---|
| `verify` | `npm test` | 合否判定のコマンド。終了コード 0 で合格 |
| `maxIterations` | 8 | 終了ゲートがブロックできる回数（人間がプロンプトを送るとリセット） |
| `maxToolCalls` | 200 | ループ中のツール呼び出し回数の上限（人間がプロンプトを送るとリセット） |
| `verifyTimeoutSec` | 240 | verify のタイムアウト。超えたら子プロセスごと止めて失敗扱い |
| `staleHours` | 12 | これより古い `active.json` は放置されたものとみなす |
| `requireReview` | true | 終了に Reviewer の `判定: OK` を必須にする |
| `checkpointCommits` | true | 周回ごとにローカルコミットする |
| `protectedPaths` | テスト設定など | 保護対象に追加するパス（glob。`/` を含まなければファイル名で照合） |

## 調整ポイント

- **コスト**: Stop フックで継続した周回もクレジットを消費します。1 周の中でも作業は続けられるため、`maxIterations` だけでなく `maxToolCalls` でも上限をかけています。最初は `maxIterations` を 3〜5、`maxToolCalls` を 100 程度にして挙動を見てから上げてください。
- **タスクの粒度**: 1周回で verify が通る大きさに分けるほど安定します。大きすぎると同じエラーで周回を浪費します。
- **ハーネス差異**: VS Code ではハーネス（Local / Copilot など）によって、フックの入出力形式や `handoffs` の対応が異なります。`stop-gate.mjs` は両方の形式で返しています。止まらない・継続しない場合は、チャットのデバッグログでフックの入出力を確認してください。フック入力にセッション ID がないハーネスでは、ループはワークスペース単位で動きます（同時に別のチャットを使うと、そちらも終了ゲートの対象になります）。

## 限界

- `pre-tool-guard.mjs` は、ツール名・ファイルパス・コマンド文字列を正規表現で見ている簡易版です。`node -e` で間接的にファイルを書くなど、意図的な迂回は防ぎきれません。本格運用ではブランチ保護・CI 側の検証と併用してください。
- タスクの完了（`- [x]`）とレビュー判定の記録は、エージェントの自己申告です。ゲートは verify の結果と「レビュー後に差分が変わっていないか」を機械的に確かめますが、Reviewer を本当に呼んだかまでは確認できません。最終確認は人間が行ってください。
