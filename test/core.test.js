import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collection } from 'discord.js';
import { Store } from '../src/core/store.js';
import { DEFAULT_CONFIG, SETTINGS, parseSetting, validateConfig } from '../src/core/config.js';
import { configView } from '../src/features/config-panel.js';
import { CONFIG_PAGES } from '../src/core/config.js';
import { calculate } from '../src/core/math.js';
import { draw } from '../src/features/giveaways.js';
import { automodReason } from '../src/features/events.js';
import { commandList, commands } from '../src/commands/index.js';
import { rulesView } from '../src/commands/community.js';
import {
  ticketManagementComponents,
  ticketPanelView,
  ticketStaffView,
  ticketUserView,
} from '../src/features/tickets.js';
import { tempCallControlView, tempCallPanelView } from '../src/features/tempcalls.js';
import { createReceipt } from '../src/features/receipts.js';
import { builtinProducts, nexusPanelView, vipRedemptionView } from '../src/features/vip.js';
import {
  createCaptcha,
  normalizeVerificationWord,
  verificationView,
} from '../src/features/verification.js';
test('transferência é atômica e não permite saldo negativo', () => {
  const db = new Store();
  db.changeAccount('g', 'a', { balance: 100 });
  db.transfer('g', 'a', 'b', 60);
  assert.equal(db.account('g', 'a').balance, 40);
  assert.equal(db.account('g', 'b').balance, 60);
  assert.throws(() => db.transfer('g', 'a', 'b', 100));
  assert.equal(db.account('g', 'b').balance, 60);
  assert.throws(() => db.transfer('g', 'a', 'a', 1));
  db.close();
});
test('configurações e deduplicação de aviso sobrevivem a reinício', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-test-')),
    path = join(dir, 'test.sqlite');
  let db = new Store(path);
  const c = structuredClone(DEFAULT_CONFIG);
  c.appearance.color = '#123456';
  db.saveConfig('g', c);
  assert.ok(db.claimEvent('winner:g:race', 'channel'));
  db.finishEvent('winner:g:race', 'message');
  db.close();
  db = new Store(path);
  assert.equal(db.config('g').appearance.color, '#123456');
  assert.equal(db.claimEvent('winner:g:race', 'channel'), false);
  assert.equal(db.events('winner:g:')[0].message, 'message');
  db.close();
  rmSync(dir, { recursive: true });
});
test('rollback desfaz alterações financeiras e registros', () => {
  const db = new Store();
  db.changeAccount('g', 'u', { balance: 100 });
  assert.throws(() =>
    db.transaction(() => {
      db.changeAccount('g', 'u', { balance: 0 });
      db.set('inventory', 'one', { created: 1 });
      throw new Error('falha');
    }),
  );
  assert.equal(db.account('g', 'u').balance, 100);
  assert.equal(db.get('inventory', 'one'), null);
  db.close();
});
test('configuração rejeita valores inválidos e descarta chaves desconhecidas', () => {
  assert.throws(() =>
    parseSetting(
      SETTINGS.find((s) => s.key === 'automod.mentions'),
      '999',
    ),
  );
  assert.throws(() =>
    parseSetting(
      SETTINGS.find((s) => s.key === 'appearance.color'),
      '#oops',
    ),
  );
  assert.throws(() =>
    validateConfig({
      ...DEFAULT_CONFIG,
      economy: { ...DEFAULT_CONFIG.economy, workMin: 9999, workMax: 1 },
    }),
  );
  const c = validateConfig({ ...DEFAULT_CONFIG, token: 'não deve existir' });
  assert.equal(c.token, undefined);
});
test('painel v2 de todas as seções é serializável e respeita limites', () => {
  const db = new Store(),
    ctx = { store: db, commands };
  for (const page of Object.keys(CONFIG_PAGES)) {
    const out = configView(ctx, 'g', '123456789012345678', page);
    const json = out.components[0].toJSON();
    assert.equal(out.flags, 32768);
    assert.ok(json.components.length <= 15);
    for (const child of json.components)
      if (child.type === 1) assert.ok(child.components.length <= 5);
  }
  db.close();
});
test('painel de regras moderno é serializável e não permite menções', () => {
  const out = rulesView(DEFAULT_CONFIG, { name: 'Comunidade teste' }, 42);
  const json = out.components[0].toJSON();
  assert.equal(out.flags, 32768);
  assert.equal(out.allowedMentions.parse.length, 0);
  assert.ok(JSON.stringify(json).includes('Li e concordo'));
  assert.ok(JSON.stringify(json).includes('42 membro(s)'));
});
test('painel de verificação usa components v2 e CAPTCHA em imagem', () => {
  const out = verificationView(DEFAULT_CONFIG, { name: 'Comunidade teste' });
  const json = out.components[0].toJSON();
  assert.equal(out.flags, 32768);
  assert.equal(out.allowedMentions.parse.length, 0);
  assert.ok(JSON.stringify(json).includes('Gerar CAPTCHA'));
  assert.ok(JSON.stringify(json).includes('Triagem visual'));
  assert.equal(normalizeVerificationWord('  LILÁS  '), 'LILAS');
  const captcha = createCaptcha(6);
  assert.match(captcha.answer, /^[A-Z2-9]{6}$/);
  assert.equal(captcha.buffer.subarray(1, 4).toString(), 'PNG');
});
test('painéis avançados de ticket e tempcall são serializáveis', () => {
  const db = new Store();
  const ctx = { store: db };
  const config = structuredClone(DEFAULT_CONFIG);
  config.tickets.panelImageUrl = 'https://example.com/ticket.png';
  const guild = { name: 'Comunidade teste' };
  const views = [
    ticketPanelView(config, guild, [
      { id: 'suporte', name: 'Suporte', emoji: '🛠️', description: 'Ajuda técnica' },
    ]),
    ticketStaffView(ctx, 'guild', 'staff'),
    ticketUserView(ctx, 'guild', 'user'),
    tempCallPanelView(config, guild, false),
    tempCallPanelView(config, guild, true),
    tempCallControlView(config, {
      owner: '123456789012345678',
      vip: true,
      locked: false,
      hidden: false,
    }),
  ];
  for (const view of views) {
    assert.equal(view.flags, 32768);
    assert.doesNotThrow(() => view.components[0].toJSON());
  }
  db.close();
});
test('painel público do ticket mantém somente quatro ações essenciais', () => {
  const rows = ticketManagementComponents();
  assert.equal(rows.length, 1);
  const components = rows[0].toJSON().components;
  assert.equal(components.length, 4);
  assert.deepEqual(
    components.map((component) => component.custom_id),
    ['ticket:memberpanel', 'ticket:staffpanel', 'ticket:claim', 'ticket:close'],
  );
});
test('configuração avançada preserva defaults e valida opções novas', () => {
  const c = validateConfig({
    ...DEFAULT_CONFIG,
    tickets: { ...DEFAULT_CONFIG.tickets, transcriptFormat: 'html+json' },
    tempcalls: { ...DEFAULT_CONFIG.tempcalls, vipRoleIds: '123456789012345678' },
  });
  assert.equal(c.modules.tempcalls, true);
  assert.equal(c.tickets.transcriptFormat, 'html+json');
  assert.equal(c.tempcalls.vipRoleIds, '123456789012345678');
  assert.throws(() =>
    validateConfig({
      ...DEFAULT_CONFIG,
      tickets: { ...DEFAULT_CONFIG.tickets, panelButtonStyle: 'neon' },
    }),
  );
});
test('catálogo VIP configurável e recibo fiscal PNG são válidos', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.vip.nexusLifetimePrice = 2345678;
  const nexus = builtinProducts(config).find((product) => product.id === 'vip_nexus_life');
  assert.equal(nexus.price, 2345678);
  assert.equal(builtinProducts(config).filter((product) => product.kind === 'vip').length, 12);
  const receipt = createReceipt({
    guildName: 'Comunidade teste',
    username: 'cliente',
    userId: '123456789012345678',
    product: nexus.name,
    amount: nexus.price,
    currency: 'moedas',
    code: 'NXS-ABCDEF-123456-ABCDEF',
    duration: 'Vitalício',
    transactionId: 'receipt-test',
  });
  assert.equal(receipt.subarray(1, 4).toString(), 'PNG');
  assert.ok(receipt.length > 10000);
});
test('painéis VIP e N3XUS usam components v2 com controles privados', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  const guild = { name: 'Comunidade teste' };
  const vip = vipRedemptionView(config, guild);
  const nexus = nexusPanelView(config, {
    owner: '123456789012345678',
    roleId: '223456789012345678',
  });
  assert.equal(vip.flags, 32768);
  assert.equal(nexus.flags, 32768);
  assert.match(JSON.stringify(vip.components[0].toJSON()), /Resgatar gift card/);
  assert.match(JSON.stringify(nexus.components[0].toJSON()), /Oferecer cargo/);
});
test('todos os comandos têm implementação e opções válidas', () => {
  assert.equal(commands.size, commandList.length);
  assert.ok(commandList.length >= 60);
  assert.ok(commandList.length <= 100);
  for (const c of commandList) {
    assert.equal(typeof c.run, 'function');
    assert.ok(c.data.description.length <= 100);
    assert.ok((c.data.options?.length ?? 0) <= 25);
  }
});
test('parser calcula precedência sem eval e rejeita execução de código', () => {
  assert.equal(calculate('(2+3)*4^2'), 80);
  assert.equal(calculate('2^3^2'), 512);
  assert.equal(calculate('-2^2'), -4);
  assert.equal(calculate('2^-2'), 0.25);
  assert.equal(calculate('1,5 + 2'), 3.5);
  assert.throws(() => calculate('process.exit()'));
  assert.throws(() => calculate('1/0'));
  assert.throws(() => calculate('1 2'));
});
test('sorteios não repetem participantes e excluem vencedores anteriores', () => {
  const values = draw(['a', 'a', 'b', 'c'], 10, ['a']);
  assert.equal(values.length, 2);
  assert.equal(new Set(values).size, 2);
  assert.ok(!values.includes('a'));
});
test('automod detecta convites, excesso de menções e spam sem regex de usuário', () => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.automod.words = 'a+b';
  assert.equal(automodReason({ content: 'entre em discord.gg/teste' }, c), 'Convite externo');
  assert.equal(automodReason({ content: 'a+b' }, c), 'Expressão bloqueada');
  assert.equal(automodReason({ content: 'aaaaab' }, c), null);
  assert.equal(
    automodReason({ content: 'oi', mentions: { users: { size: c.automod.mentions } } }, c),
    'Excesso de menções',
  );
  assert.equal(
    automodReason({ content: 'oi' }, c, Array(c.automod.spamMessages).fill(Date.now())),
    'Rajada de mensagens',
  );
});

test('automod avançado detecta repetição, linhas, emojis, conta nova e arquivos', () => {
  const c = structuredClone(DEFAULT_CONFIG);
  const now = Date.now();
  assert.equal(
    automodReason(
      { content: 'mensagem igual' },
      c,
      Array.from({ length: c.automod.duplicates }, () => ({ at: now, content: 'mensagem igual' })),
    ),
    'Mensagens repetidas',
  );
  c.automod.duplicates = 0;
  c.automod.maxLines = 2;
  assert.equal(automodReason({ content: 'a\nb\nc' }, c), 'Excesso de linhas');
  c.automod.maxLines = 0;
  c.automod.maxEmojis = 1;
  assert.equal(automodReason({ content: '😀😀' }, c), 'Excesso de emojis');
  c.automod.maxEmojis = 0;
  c.automod.newAccountHours = 24;
  assert.equal(
    automodReason({ content: 'oi', author: { createdTimestamp: now - 1000 } }, c),
    'Conta muito recente',
  );
  c.automod.newAccountHours = 0;
  c.automod.blockFiles = true;
  assert.equal(
    automodReason({ content: '', attachments: new Collection([['x', { name: 'virus.exe' }]]) }, c),
    'Tipo de arquivo bloqueado',
  );
});
