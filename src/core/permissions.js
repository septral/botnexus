import { PermissionFlagsBits as P, PermissionsBitField, ChannelType } from 'discord.js';
export const DANGEROUS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'ManageWebhooks',
  'MentionEveryone',
  'ManageMessages',
  'ManageNicknames',
  'MuteMembers',
  'DeafenMembers',
  'MoveMembers',
  'ViewAuditLog',
  'ManageThreads',
  'ManageEvents',
  'ManageGuildExpressions',
]
  .map((key) => P[key])
  .filter(Boolean);
export function requireUser(i, permission) {
  if (!i.inGuild()) throw new Error('Use este comando em um servidor.');
  if (!i.memberPermissions?.has(permission))
    throw new Error(
      `Você precisa da permissão: ${new PermissionsBitField(permission).toArray().join(', ')}.`,
    );
}
export async function requireBot(i, permissions, channel = i.channel) {
  const me = i.guild.members.me ?? (await i.guild.members.fetchMe());
  const perms = channel?.permissionsFor?.(me) ?? me.permissions;
  const missing = new PermissionsBitField(permissions).toArray().filter((p) => !perms.has(p));
  if (missing.length) throw new Error(`Faltam permissões para o bot: ${missing.join(', ')}.`);
  return me;
}
export async function moderateTarget(i, user, permission) {
  requireUser(i, permission);
  await requireBot(i, permission);
  if (user.id === i.user.id || user.id === i.client.user.id || user.id === i.guild.ownerId)
    throw new Error('Não é possível moderar você mesmo, o bot ou o dono.');
  const target = await i.guild.members.fetch(user.id).catch((e) => {
    if (e.code === 10007) return null;
    throw e;
  });
  if (target) {
    const actor = await i.guild.members.fetch(i.user.id);
    const me = i.guild.members.me;
    if (
      i.user.id !== i.guild.ownerId &&
      actor.roles.highest.comparePositionTo(target.roles.highest) <= 0
    )
      throw new Error('Seu cargo precisa estar acima do cargo do membro.');
    if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0)
      throw new Error('Mova o cargo do bot para cima do cargo do membro.');
  }
  return target;
}
export async function validateRole(guild, roleId, actorId = null, { safeOnly = true } = {}) {
  const role = await guild.roles.fetch(roleId);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!role || role.id === guild.id || role.managed)
    throw new Error('Escolha um cargo comum, diferente de @everyone e de cargos de integração.');
  if (!me.permissions.has(P.ManageRoles) || me.roles.highest.comparePositionTo(role) <= 0)
    throw new Error('O bot precisa de Gerenciar cargos e estar acima do cargo escolhido.');
  if (safeOnly && DANGEROUS.some((p) => role.permissions.has(p, false)))
    throw new Error(
      'Este recurso aceita apenas cargos sem permissões administrativas ou de moderação.',
    );
  if (actorId && actorId !== guild.ownerId) {
    const actor = await guild.members.fetch(actorId);
    if (actor.roles.highest.comparePositionTo(role) <= 0)
      throw new Error('O cargo escolhido precisa ficar abaixo do seu cargo.');
  }
  return role;
}
export async function validateSettingReference(i, setting, value) {
  if (!value) return;
  if (setting.type === 'role') {
    const role = await i.guild.roles.fetch(value);
    if (!role || role.id === i.guildId) throw new Error('Escolha um cargo diferente de @everyone.');
    if (setting.assignable) await validateRole(i.guild, value, i.user.id);
  }
  if (setting.type === 'roles') {
    for (const roleId of value.split(/\s+/).filter(Boolean)) {
      const role = await i.guild.roles.fetch(roleId);
      if (!role || role.id === i.guildId)
        throw new Error('Escolha cargos diferentes de @everyone.');
    }
  }
  if (['channel', 'category', 'voice'].includes(setting.type)) {
    const c = await i.guild.channels.fetch(value);
    if (!c || c.guildId !== i.guildId) throw new Error('Canal não encontrado.');
    if (
      setting.type === 'category'
        ? c.type !== ChannelType.GuildCategory
        : setting.type === 'voice'
          ? c.type !== ChannelType.GuildVoice
          : ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)
    )
      throw new Error('Tipo de canal inválido.');
  }
  if (setting.type === 'rewards')
    for (const line of value.split('\n').filter(Boolean))
      await validateRole(i.guild, line.split(':')[1], i.user.id);
}
