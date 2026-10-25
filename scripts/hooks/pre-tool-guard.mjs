// ツール実行前のガード。
// 1) 危険なコマンドを止める
// 2) ループが自分の「採点基準」（フック・設定・GOAL）を書き換えるのを止める
import { readFileSync } from "node:fs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}

const toolName = String(input.tool_name ?? input.toolName ?? "").toLowerCase();
const args = JSON.stringify(input.tool_input ?? input.toolArgs ?? {});

const DANGEROUS = [
  /git\s+push/i,
  /git\s+reset\s+--hard/i,
  /rm\s+-rf?\s+(\/|~|\*|\.\s|\.$)/i,
  /Remove-Item\b.*-Recurse/i,
  /\bdrop\s+(table|database)\b/i,
  /--no-verify/i,
];

const PROTECTED = [
  /\.github[\\/]+hooks/i,
  /scripts[\\/]+hooks/i,
  /loop[\\/]+loop\.config\.json/i,
  /loop[\\/]+GOAL\.md/i,
];

const isWrite = /(edit|write|create|replace|patch|insert|delete|rename|apply)/.test(toolName);
const isShell = /(terminal|shell|bash|execute|run|command|powershell)/.test(toolName);

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

if (DANGEROUS.some((re) => re.test(args))) {
  deny("ループ実行中は危険な操作が禁止されています（push / 強制削除 / DROP 等）。必要なら STATE.md の「人間への質問」に書いてください。");
}
if ((isWrite || isShell) && PROTECTED.some((re) => re.test(args))) {
  deny("フック・ループ設定・GOAL.md は人間だけが編集できます。変更が必要なら STATE.md の「人間への質問」に書いてください。");
}

process.stdout.write("{}");
