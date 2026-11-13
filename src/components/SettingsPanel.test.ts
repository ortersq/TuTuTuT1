import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsPanel } from './SettingsPanel';

const noop = async () => {};

test('settings panel renders the Telegram card, its toggles and the setup guide', () => {
  const html = renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      status: null,
      onAddSymbol: noop,
      onRemoveSymbol: noop,
      onSaveCredentials: noop,
      onUpdateConfig: () => {},
      onSaveNotificationConfig: async () => ({ success: true, message: 'ok' }),
      onTestTelegram: async () => ({ success: true, message: 'ok' }),
    } as any)
  );

  // Card + inputs
  assert.match(html, /Telegram 交易通知/);
  assert.match(html, /Bot Token/);
  assert.match(html, /Chat ID/);
  // Toggles
  assert.match(html, /总开关/);
  assert.match(html, /开平仓推送/);
  assert.match(html, /止盈止损变动/);
  assert.match(html, /紧急风控预警/);
  // Guide: the three steps and the most common failure modes must be present
  assert.match(html, /3 分钟配置教程/);
  assert.match(html, /BotFather/);
  assert.match(html, /userinfobot/);
  assert.match(html, /chat not found/);
  assert.match(html, /401 Unauthorized/);
  assert.match(html, /429 Too Many Requests/);
});
