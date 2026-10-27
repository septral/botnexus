import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { Store } from '../src/core/store.js';
import { makeRouter } from '../src/core/router.js';
import { moderateTarget, validateRole } from '../src/core/permissions.js';

const position = (n) => ({
  position: n,
  comparePositionTo(other) {
    return this.position - other.position;
  },
});

test('roteador impede comando protegido antes de executar a ação', async () => {
  const db = new Store();
  let called = false;
  let answer;
  const ctx = {
    store: db,
    commands: new Map([
      [
        'banir',
        {
          name: 'banir',
          module: 'moderation',
          permission: P.BanMembers,
          run: () => {
            called = true;
          },
        },
      ],
    ]),
  };
  const i = {
    commandName: 'banir',
    guildId: 'g',
    user: { id: 'u' },
    memberPermissions: new PermissionsBitField(),
    inGuild: () => true,
    inCachedGuild: () => true,
    isChatInputCommand: () => true,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    reply: async (payload) => {
      answer = payload;
    },
  };
  await makeRouter(ctx)(i);
  assert.equal(called, false);
  assert.match(answer.content, /permissão/);
  db.close();
});

test('roteador aplica a preferência de resposta pública por comando', async () => {
  const db = new Store();
  const config = db.config('g');
  config.access.publicCommands = 'ping';
  db.saveConfig('g', config);
  let flags;
  const ctx = {
    store: db,
    commands: new Map([
      ['ping', { name: 'ping', module: 'utilities', permission: null, run: () => {} }],
    ]),
  };
  const i = {
    commandName: 'ping',
    guildId: 'g',
    user: { id: 'u' },
    deferred: false,
    memberPermissions: new PermissionsBitField(),
    inCachedGuild: () => true,
    isChatInputCommand: () => true,
    isMessageComponent: () => false,
    isModalSubmit: () => false,
    deferReply: async (payload) => {
      flags = payload.flags;
      i.deferred = true;
    },
  };
  await makeRouter(ctx)(i);
  assert.equal(flags, undefined);
  assert.equal(i.nexusEphemeral, false);
  db.close();
});

test('hierarquia bloqueia alvo acima do moderador, mesmo com BanMembers', async () => {
  const member = { id: 'target', roles: { highest: position(8) } };
  const actor = { roles: { highest: position(5) } };
  const me = {
    permissions: new PermissionsBitField(P.BanMembers),
    roles: { highest: position(10) },
  };
  const i = {
    user: { id: 'actor' },
    client: { user: { id: 'bot' } },
    inGuild: () => true,
    memberPermissions: new PermissionsBitField(P.BanMembers),
    channel: { permissionsFor: () => new PermissionsBitField(P.BanMembers) },
    guild: {
      ownerId: 'owner',
      members: { me, fetch: async (id) => (id === 'actor' ? actor : member) },
    },
  };
  await assert.rejects(moderateTarget(i, { id: 'target' }, P.BanMembers), /Seu cargo/);
  await assert.rejects(moderateTarget(i, { id: 'owner' }, P.BanMembers), /dono/);
  await assert.rejects(moderateTarget(i, { id: 'actor' }, P.BanMembers), /você mesmo/);
});

test('autoatribuição rejeita cargos privilegiados e cargos acima do bot', async () => {
  let role = {
    id: 'role',
    managed: false,
    position: 5,
    permissions: new PermissionsBitField(P.MuteMembers),
  };
  const guild = {
    id: 'guild',
    ownerId: 'owner',
    roles: { fetch: async () => role },
    members: {
      me: { permissions: new PermissionsBitField(P.ManageRoles), roles: { highest: position(10) } },
    },
  };
  await assert.rejects(validateRole(guild, 'role'), /administrativas/);
  role = { ...role, permissions: new PermissionsBitField(), position: 11 };
  await assert.rejects(validateRole(guild, 'role'), /acima/);
});
