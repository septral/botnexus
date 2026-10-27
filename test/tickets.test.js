import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { Store } from '../src/core/store.js';
import { transcript } from '../src/features/tickets.js';

test('transcript de ticket gera HTML e escapa conteúdo das mensagens', async () => {
  const store = new Store();
  const messages = new Collection();
  messages.set('1', {
    id: '1',
    cleanContent: '<script>alert(1)</script>\nTudo bem?',
    content: '<script>alert(1)</script>\nTudo bem?',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    author: {
      id: 'owner',
      username: 'teste',
      globalName: 'Pessoa Teste',
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    },
    member: { displayName: 'Pessoa Teste' },
    attachments: new Collection(),
    embeds: [],
  });
  const channel = {
    id: 'channel',
    name: 'ticket-teste',
    permissionsFor: () =>
      new PermissionsBitField([P.ViewChannel, P.ReadMessageHistory, P.AttachFiles]),
    messages: { fetch: async () => messages },
  };
  const i = {
    channel,
    channelId: channel.id,
    guildId: 'guild',
    user: { id: 'owner' },
    guild: {
      name: 'Servidor',
      members: {
        me: { permissions: new PermissionsBitField(), roles: { cache: new Collection() } },
      },
    },
    memberPermissions: new PermissionsBitField(),
    member: { roles: { cache: new Collection() } },
  };
  store.set('tickets', channel.id, {
    guild: 'guild',
    channel: channel.id,
    owner: 'owner',
    subject: 'Ajuda',
    created: Date.now(),
    closed: false,
  });
  const file = await transcript(i, { store });
  const output = file.attachment.toString('utf8');
  assert.equal(file.name, 'ticket-channel.html');
  assert.match(output, /<!doctype html>/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(output, /<script>alert/);
  store.close();
});
