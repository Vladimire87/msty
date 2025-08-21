const test = require('node:test');
const assert = require('node:assert/strict');
const parseNumber = require('../parseNumber');

test('parses comma thousands with dot decimal', () => {
  assert.strictEqual(parseNumber('1,234.56'), 1234.56);
});

test('parses space thousands with comma decimal', () => {
  assert.strictEqual(parseNumber('1 234,56'), 1234.56);
});

test('parses underscore thousands', () => {
  assert.strictEqual(parseNumber('1_234.56'), 1234.56);
});
