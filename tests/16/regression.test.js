// Easy / Hard は、同じシードなら Extreme の追加前と同じステージを作る。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot } = require('./helpers.js');

test('Easy / Hard は基準値と同じステージを作る', () => {
  assert.deepEqual(snapshot(), require('./fixtures/easy-hard.json'));
});
