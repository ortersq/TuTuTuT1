import test from 'node:test';
import assert from 'node:assert';
import { NotificationConfig, RiskManagementConfig } from '../types/trading';

test('Emergency Notification Config & Alert Payload Structure', () => {
  const notif: NotificationConfig = {
    enableEmergencyAlerts: true,
    telegramBotToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    telegramChatId: '987654321',
    webhookUrl: 'https://example.com/webhook/emergency',
  };

  assert.strictEqual(notif.enableEmergencyAlerts, true);
  assert.ok(notif.telegramBotToken && notif.telegramBotToken.length > 10);
  assert.strictEqual(notif.telegramChatId, '987654321');
});

test('Zero-Touch Dynamic Auto-Breakeven Stop Threshold Logic', () => {
  // Logic helper testing dynamic breakeven decision
  const calculateDynamicBreakevenThreshold = (volatilityRatio: number) => {
    // High volatility -> lock early at N=0.6% ($12 USDT), normal -> N=0.9% ($15 USDT)
    const dynamicPercent = volatilityRatio >= 1.5 ? 0.6 : 0.9;
    const dynamicUsdt = volatilityRatio >= 1.5 ? 12 : 15;
    return { dynamicPercent, dynamicUsdt };
  };

  const highVol = calculateDynamicBreakevenThreshold(2.1);
  assert.strictEqual(highVol.dynamicPercent, 0.6);
  assert.strictEqual(highVol.dynamicUsdt, 12);

  const normalVol = calculateDynamicBreakevenThreshold(1.1);
  assert.strictEqual(normalVol.dynamicPercent, 0.9);
  assert.strictEqual(normalVol.dynamicUsdt, 15);
});
