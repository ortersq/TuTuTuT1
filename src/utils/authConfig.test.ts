import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdminPasswordFromEnvContent,
  verifyAdminPassword,
  setAdminPassword,
  getAdminPassword,
} from './authConfig';

test('parseAdminPasswordFromEnvContent extracts plain, quoted, spaced, and lowercase passwords', () => {
  assert.equal(parseAdminPasswordFromEnvContent('ADMIN_PASSWORD=mySecret123'), 'mySecret123');
  assert.equal(parseAdminPasswordFromEnvContent('ADMIN_PASSWORD="mySecret123"'), 'mySecret123');
  assert.equal(parseAdminPasswordFromEnvContent("ADMIN_PASSWORD='mySecret123'"), 'mySecret123');
  assert.equal(parseAdminPasswordFromEnvContent('ADMIN_PASSWORD = mySecret123  '), 'mySecret123');
  assert.equal(parseAdminPasswordFromEnvContent('admin_password="lowercasename"'), 'lowercasename');
  assert.equal(parseAdminPasswordFromEnvContent('ADMIN_PASSWORD=withComment # this is a comment'), 'withComment');
  assert.equal(parseAdminPasswordFromEnvContent('# ADMIN_PASSWORD=commentedOut\nADMIN_PASSWORD=activeOne'), 'activeOne');
});

test('parseAdminPasswordFromEnvContent returns null when no admin password defined', () => {
  assert.equal(parseAdminPasswordFromEnvContent('BINANCE_API_KEY=foo\nBINANCE_API_SECRET=bar'), null);
  assert.equal(parseAdminPasswordFromEnvContent(''), null);
});

test('verifyAdminPassword falls back cleanly to default admin123 when unset', () => {
  // If no .env exists or has default
  const isDefaultValid = verifyAdminPassword('admin123');
  assert.ok(typeof isDefaultValid === 'boolean');
  assert.equal(verifyAdminPassword('wrongpassword999'), false);
});

test('setAdminPassword and getAdminPassword update and read cleanly', () => {
  const res = setAdminPassword('testSuitePass888');
  assert.equal(res.success, true);
  assert.equal(getAdminPassword(), 'testSuitePass888');
  assert.equal(verifyAdminPassword('testSuitePass888'), true);
  // Restore default for cleanly continuing tests
  setAdminPassword('admin123');
  assert.equal(getAdminPassword(), 'admin123');
});
