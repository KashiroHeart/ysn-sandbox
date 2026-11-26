// Easy / Hard の基準値（fixtures/easy-hard.json）を作り直す。core.js の生成を意図して変えたときだけ使う。
'use strict';

const fs = require('fs');
const path = require('path');
const { snapshot } = require('./helpers.js');

const file = path.join(__dirname, 'fixtures', 'easy-hard.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(snapshot(), null, 1) + '\n');
console.log('wrote', path.relative(process.cwd(), file));
