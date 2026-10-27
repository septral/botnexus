import { defer } from '../core/ui.js';
import { PermissionFlagsBits as P } from 'discord.js';
import { validateRole, requireBot } from '../core/permissions.js';
import { reply } from '../core/ui.js';
export async function roleComponent(i, ctx) {
  const id = i.customId.split(':')[1],
    panel = ctx.store.get('rolepanels', id);
  if (!panel || panel.guild !== i.guildId || panel.message !== i.message.id)
    throw new Error('Painel de cargos inválido.');
  const roleId = i.values[0];
  if (!panel.roles.includes(roleId)) throw new Error('Cargo não permitido por este painel.');
  await defer(i);
  await requireBot(i, P.ManageRoles);
  const role = await validateRole(i.guild, roleId);
  const member = await i.guild.members.fetch(i.user.id);
  const has = member.roles.cache.has(role.id);
  await member.roles[has ? 'remove' : 'add'](role, 'Autoatribuição no painel');
  return reply(i, `Cargo ${role} ${has ? 'removido' : 'adicionado'}.`);
}
