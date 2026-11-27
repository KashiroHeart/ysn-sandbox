// Extreme の生成を実際の設定で集計し、設計書 10 章の受け入れ基準と比べる。
// テストではなく手で走らせる（数分かかる）: node tests/16/stats.js [シード数=30]
'use strict';

const { R } = require('./helpers.js');

const N = Number(process.argv[2]) || 30;
const rows = [];
for (let seed = 1; seed <= N; seed++) {
  const t0 = Date.now();
  const s = R.generateStage('extreme', seed);
  const ms = Date.now() - t0;
  const sections = s.sections || [];
  const row = {
    seed, ms, valid: s.valid, tries: s.tries, presses: s.presses,
    kinds: sections.map((x) => x.kind),
    hard: sections.filter((x) => x.tier === 'hard').length,
    relief: sections.filter((x) => x.tier === 'relief').length,
  };
  rows.push(row);
  console.log(`seed ${String(seed).padStart(3)}  ${String(ms).padStart(6)}ms  valid ${String(row.valid).padEnd(5)}  tries ${String(row.tries).padStart(2)}  presses ${String(row.presses).padStart(3)}  ${row.kinds.join(' ')}`);
}

const pct = (n) => Math.round((100 * n) / rows.length);
const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
const median = sorted[Math.floor((sorted.length - 1) / 2)];
const max = sorted[sorted.length - 1];
const valid = rows.filter((r) => r.valid).length;
const overhang = rows.filter((r) => r.kinds.includes('overhang')).length;
const kinds = {};
for (const kind of Object.keys(R.SECTIONS)) kinds[kind] = pct(rows.filter((r) => r.kinds.includes(kind)).length);
const count = (k) => rows.reduce((o, r) => ({ ...o, [r[k]]: (o[r[k]] || 0) + 1 }), {});

console.log('');
console.log(`valid ${valid}/${rows.length} (${pct(valid)}%)  ms median ${median} max ${max}  overhang ${pct(overhang)}%`);
console.log(`kinds (% of stages) ${JSON.stringify(kinds)}`);
console.log(`hard counts ${JSON.stringify(count('hard'))}  relief counts ${JSON.stringify(count('relief'))}`);

const fails = [];
if (pct(valid) < 90) fails.push('valid < 90%');
if (median > 10000) fails.push('median > 10000ms');
if (max > 25000) fails.push('max > 25000ms');
if (pct(overhang) < 25 || pct(overhang) > 40) fails.push('overhang not in 25-40%');
for (const [kind, p] of Object.entries(kinds)) if (p < 15) fails.push(`${kind} < 15%`);
console.log(fails.length ? `NOT MET: ${fails.join(', ')}` : 'all criteria met');
process.exitCode = fails.length ? 1 : 0;
