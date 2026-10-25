// 人間がプロンプトを送るたびに周回カウンタを0に戻す。
// （Stop フックによる自動継続はユーザー送信ではないので、ここは通らない）
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("loop", { recursive: true });
writeFileSync("loop/.iterations", "0");
process.stdout.write("{}");
