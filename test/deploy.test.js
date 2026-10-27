import test from 'node:test';
import assert from 'node:assert/strict';
import { commandList } from '../src/commands/index.js';
import { commandCatalog, commandPayload } from '../src/core/deploy.js';

test('payload de guild remove somente campos exclusivos do registro global', () => {
  const guild = commandPayload(commandList, false);
  const global = commandPayload(commandList, true);
  assert.equal(guild.length, commandList.length);
  assert.equal(global.length, commandList.length);
  assert.ok(global.every((command) => Array.isArray(command.contexts)));
  assert.ok(guild.every((command) => command.contexts === undefined));
  assert.ok(guild.every((command) => command.integration_types === undefined));
});

test('catálogo de deploy inclui comandos novos e não contém eleições', () => {
  const catalog = commandCatalog(commandList);
  const names = catalog.catalog.map((command) => command.name);
  assert.ok(names.includes('setarloja'));
  assert.ok(names.includes('adicionaremoji'));
  assert.ok(names.includes('verificarusuario'));
  assert.ok(!names.includes('apuração'));
  assert.ok(!names.includes('resultados'));
  assert.equal(catalog.commands, commandList.length);
});
