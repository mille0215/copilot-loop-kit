// 終了ゲート: エージェントが止まろうとしたときに呼ばれる。
// loop/.active があるときだけ働き、
//   - verify が失敗している
//   - STATE.md に未完了タスクが残っている
// のどちらかなら、終了をブロックして次の周回へ戻す。
// 周回数が上限に達したら、無限ループ防止のため必ず止める。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const ACTIVE = "loop/.active";
const COUNTER = "loop/.iterations";
const LOG = "loop/.last-verify.log";

// 標準入力は読み捨て（使う場合はここで parse）
try { readFileSync(0, "utf8"); } catch {}

const allow = (msg) => {
  process.stdout.write(JSON.stringify(msg ? { systemMessage: msg } : {}));
  process.exit(0);
};

const block = (reason) => {
  // ハーネスによって読むフィールドが違うため、両方の形式で返す
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason,
    hookSpecificOutput: { hookEventName: "Stop", decision: "block", reason },
  }));
  process.exit(0);
};

if (!existsSync(ACTIVE)) allow(); // ループ中でなければ何もしない

const cfg = JSON.parse(readFileSync("loop/loop.config.json", "utf8"));
const max = Number(cfg.maxIterations ?? 8);
const n = Number(existsSync(COUNTER) ? readFileSync(COUNTER, "utf8") : 0) || 0;

if (n >= max) {
  allow(`ループ上限（${max}周）に達したので停止しました。loop/STATE.md を確認してください。`);
}

// 検証を実行
let ok = true;
let out = "";
try {
  out = execSync(cfg.verify, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: Number(cfg.verifyTimeoutSec ?? 240) * 1000,
  });
} catch (e) {
  ok = false;
  out = `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`;
}
writeFileSync(LOG, out);

// 未完了タスクの確認（「タスク」見出しの下だけを見る）
const state = existsSync("loop/STATE.md") ? readFileSync("loop/STATE.md", "utf8") : "";
const taskSection = (state.split(/^##\s*タスク\s*$/m)[1] ?? "").split(/^##\s/m)[0];
const remaining = (taskSection.match(/^\s*-\s\[\s\]/gm) ?? []).length;

if (ok && remaining === 0) {
  allow("検証成功・全タスク完了。ループ終了です。");
}

writeFileSync(COUNTER, String(n + 1));

const tail = out.slice(-2000);
const reasons = [];
if (!ok) reasons.push(`verify（${cfg.verify}）が失敗しています。出力の末尾:\n${tail}`);
if (remaining > 0) reasons.push(`loop/STATE.md に未完了タスクが ${remaining} 件残っています。`);

block(
  `まだ終了できません（${n + 1}/${max} 周目）。\n` +
  reasons.join("\n\n") +
  `\n\n次の周回: STATE.md を読み直し、上記を1つずつ解消してください。` +
  `人間の判断が必要な場合は「人間への質問」に書き、loop/.active を削除してから終了してください。`
);
