import { defer } from '../core/ui.js';
import { PermissionFlagsBits as P } from 'discord.js';
import { D, text, integer, user, role, boolean, sub } from './definition.js';
import { moderateTarget, requireUser, requireBot, validateRole } from '../core/permissions.js';
import { embed, reply, safe, truncate, parseDuration, time } from '../core/ui.js';
import { audit, log } from '../core/log.js';
const reason = (i) => i.options.getString('motivo') ?? 'Não informado';
async function record(i, ctx, target, action, why) {
  const id = ctx.store.addCase(i.guildId, target.id, i.user.id, action, why);
  await audit(
    ctx,
    i.guild,
    `🛡️ CASO #${id} / ${action}`,
    `**Membro:** <@${target.id}> (${target.id})\n**Responsável:** <@${i.user.id}>\n**Motivo:** ${safe(why)}`,
  );
  return id;
}
async function notify(i, ctx, target, action, why) {
  if (ctx.store.config(i.guildId).moderation.dm)
    await target
      .send({
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            `Moderação / ${i.guild.name}`,
            `**Ação:** ${action}\n**Motivo:** ${safe(why)}`,
          ),
        ],
        allowedMentions: { parse: [] },
      })
      .catch((e) =>
        log('warn', 'moderation_dm_unavailable', { user: target.id, error: e.code ?? e.message }),
      );
}
const moderation = [
  D(
    'banir',
    'Bane um usuário com verificação de hierarquia.',
    'moderation',
    P.BanMembers,
    [
      user(),
      text('motivo', 'Motivo da punição'),
      integer('apagar_dias', 'Dias de mensagens a apagar', false, 0, 7),
    ],
    async (i, ctx) => {
      const u = i.options.getUser('usuario');
      await moderateTarget(i, u, P.BanMembers);
      await defer(i);
      await notify(i, ctx, u, 'Banimento', reason(i));
      await i.guild.members.ban(u, {
        reason: truncate(`${i.user.tag}: ${reason(i)}`, 480),
        deleteMessageSeconds: (i.options.getInteger('apagar_dias') ?? 0) * 86400,
      });
      const id = await record(i, ctx, u, 'BAN', reason(i));
      return reply(i, `✅ ${safe(u.tag)} banido. Caso #${id}.`);
    },
  ),
  D(
    'desbanir',
    'Remove um banimento pelo ID.',
    'moderation',
    P.BanMembers,
    [text('id', 'ID do usuário banido', true, { max_length: 20 }), text('motivo', 'Motivo')],
    async (i, ctx) => {
      requireUser(i, P.BanMembers);
      await requireBot(i, P.BanMembers);
      const id = i.options.getString('id');
      if (!/^\d{17,20}$/.test(id)) throw new Error('ID inválido.');
      await defer(i);
      await i.guild.members.unban(id, reason(i));
      const n = await record(i, ctx, { id }, 'UNBAN', reason(i));
      return reply(i, `Banimento removido. Caso #${n}.`);
    },
  ),
  D(
    'expulsar',
    'Expulsa um membro do servidor.',
    'moderation',
    P.KickMembers,
    [user(), text('motivo', 'Motivo')],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.KickMembers);
      if (!m) throw new Error('O usuário não está no servidor.');
      await defer(i);
      await notify(i, ctx, u, 'Expulsão', reason(i));
      await m.kick(reason(i));
      const id = await record(i, ctx, u, 'KICK', reason(i));
      return reply(i, `Membro expulso. Caso #${id}.`);
    },
  ),
  D(
    'timeout',
    'Aplica timeout por até 28 dias.',
    'moderation',
    P.ModerateMembers,
    [
      user(),
      text('duracao', 'Ex.: 10m, 2h ou 7d', true, { max_length: 12 }),
      text('motivo', 'Motivo'),
    ],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.ModerateMembers);
      if (!m?.moderatable)
        throw new Error('O membro não pode receber timeout (administradores não podem).');
      const ms = parseDuration(i.options.getString('duracao'), 28 * 86400000);
      await defer(i);
      await m.timeout(ms, reason(i));
      const id = await record(i, ctx, u, 'TIMEOUT', reason(i));
      await notify(
        i,
        ctx,
        u,
        `Timeout até ${new Date(Date.now() + ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        reason(i),
      );
      return reply(i, `Timeout aplicado até ${time(Date.now() + ms)}. Caso #${id}.`);
    },
  ),
  D(
    'untimeout',
    'Remove o timeout de um membro.',
    'moderation',
    P.ModerateMembers,
    [user(), text('motivo', 'Motivo')],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.ModerateMembers);
      if (!m?.moderatable) throw new Error('Membro não moderável.');
      await m.timeout(null, reason(i));
      const id = await record(i, ctx, u, 'UNTIMEOUT', reason(i));
      return reply(i, `Timeout removido. Caso #${id}.`);
    },
  ),
  D(
    'advertir',
    'Registra uma advertência e aplica o limite configurado.',
    'moderation',
    P.ModerateMembers,
    [user(), text('motivo', 'Motivo da advertência', true)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.ModerateMembers);
      await defer(i);
      const id = await record(i, ctx, u, 'WARN', reason(i)),
        c = ctx.store.config(i.guildId);
      const count = ctx.store.db
        .prepare(
          "SELECT COUNT(*) AS n FROM cases WHERE guild=? AND target=? AND action='WARN' AND active=1",
        )
        .get(i.guildId, u.id).n;
      let extra = '';
      if (c.moderation.warnThreshold > 0 && count >= c.moderation.warnThreshold && m?.moderatable) {
        await m.timeout(c.moderation.timeoutMinutes * 60000, 'Limite de advertências');
        extra = ' Timeout automático aplicado.';
      }
      await notify(i, ctx, u, 'Advertência', reason(i));
      return reply(i, `Advertência #${id} registrada. Total ativo: ${count}.${extra}`);
    },
  ),
  D(
    'avisos',
    'Lista advertências de um membro.',
    'moderation',
    P.ModerateMembers,
    [user()],
    async (i, ctx) => {
      const rows = ctx.store
        .cases(i.guildId, i.options.getUser('usuario').id)
        .filter((v) => v.action === 'WARN' && v.active);
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '📋 ADVERTÊNCIAS',
            rows
              .map((r) => `**#${r.id}** · ${safe(r.reason)} · ${time(r.created)}`)
              .join('\n')
              .slice(0, 3900) || 'Nenhuma advertência ativa.',
          ),
        ],
      });
    },
  ),
  D(
    'removeraviso',
    'Desativa uma advertência específica.',
    'moderation',
    P.ModerateMembers,
    [integer('id', 'Número do caso', true)],
    async (i, ctx) => {
      const id = i.options.getInteger('id');
      const r = ctx.store.db
        .prepare("UPDATE cases SET active=0 WHERE id=? AND guild=? AND action='WARN' AND active=1")
        .run(id, i.guildId);
      if (!r.changes) throw new Error('Advertência ativa não encontrada.');
      await audit(
        ctx,
        i.guild,
        '📋 Advertência removida',
        `Caso #${id} desativado por ${i.user.tag}.`,
      );
      return reply(i, 'Advertência desativada. O histórico foi preservado.');
    },
  ),
  D(
    'limparavisos',
    'Desativa todos os avisos de um membro.',
    'moderation',
    P.ModerateMembers,
    [user()],
    async (i, ctx) => {
      const u = i.options.getUser('usuario');
      const r = ctx.store.db
        .prepare(
          "UPDATE cases SET active=0 WHERE guild=? AND target=? AND action='WARN' AND active=1",
        )
        .run(i.guildId, u.id);
      await audit(
        ctx,
        i.guild,
        '📋 Avisos removidos',
        `${i.user.tag} desativou ${r.changes} aviso(s) de <@${u.id}>.`,
      );
      return reply(i, `${r.changes} aviso(s) desativado(s).`);
    },
  ),
  D(
    'caso',
    'Mostra um caso de moderação.',
    'moderation',
    P.ModerateMembers,
    [integer('id', 'Número do caso', true)],
    async (i, ctx) => {
      const c = ctx.store.db
        .prepare('SELECT * FROM cases WHERE guild=? AND id=?')
        .get(i.guildId, i.options.getInteger('id'));
      if (!c) throw new Error('Caso não encontrado.');
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            `🛡️ CASO #${c.id}`,
            `**Ação:** ${c.action}\n**Membro:** <@${c.target}>\n**Responsável:** <@${c.actor}>\n**Ativo:** ${c.active ? 'Sim' : 'Não'}\n**Data:** ${time(c.created)}\n**Motivo:** ${safe(c.reason)}`,
          ),
        ],
      });
    },
  ),
  D(
    'historico',
    'Consulta os casos recentes de moderação.',
    'moderation',
    P.ModerateMembers,
    [user('usuario', 'Filtrar por usuário', false)],
    async (i, ctx) =>
      reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '📜 HISTÓRICO',
            ctx.store
              .cases(i.guildId, i.options.getUser('usuario')?.id)
              .slice(0, 20)
              .map(
                (c) =>
                  `**#${c.id} ${c.action}** · <@${c.target}> · ${safe(truncate(c.reason, 100))}`,
              )
              .join('\n') || 'Nenhum caso registrado.',
          ),
        ],
      }),
  ),
  D(
    'nota',
    'Gerencia notas internas sobre membros.',
    'moderation',
    P.ModerateMembers,
    [
      sub('adicionar', 'Registra nota interna', [
        user(),
        text('texto', 'Nota para a equipe', true),
      ]),
      sub('listar', 'Lista notas internas', [user()]),
      sub('remover', 'Desativa uma nota', [integer('id', 'ID do caso de nota', true)]),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      if (action === 'adicionar') {
        const id = await record(
          i,
          ctx,
          i.options.getUser('usuario'),
          'NOTE',
          i.options.getString('texto'),
        );
        return reply(i, `Nota #${id} registrada.`);
      }
      if (action === 'remover') {
        const r = ctx.store.db
          .prepare("UPDATE cases SET active=0 WHERE guild=? AND id=? AND action='NOTE'")
          .run(i.guildId, i.options.getInteger('id'));
        return reply(i, `${r.changes} nota(s) desativada(s).`);
      }
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '🗒️ NOTAS INTERNAS',
            ctx.store
              .cases(i.guildId, i.options.getUser('usuario').id)
              .filter((c) => c.action === 'NOTE' && c.active)
              .map((c) => `#${c.id} · ${safe(c.reason)}`)
              .join('\n') || 'Nenhuma nota.',
          ),
        ],
      });
    },
  ),
  D(
    'limpar',
    'Apaga até 100 mensagens recentes, preservando as fixadas.',
    'moderation',
    P.ManageMessages,
    [
      integer('quantidade', 'Quantidade de mensagens', true, 1, 100),
      user('usuario', 'Filtrar por autor', false),
      boolean('bots', 'Limpar apenas mensagens de bots'),
    ],
    async (i, ctx) => {
      await requireBot(i, [P.ManageMessages, P.ReadMessageHistory]);
      await defer(i);
      if (!i.channel?.bulkDelete) throw new Error('Use em um canal de texto.');
      const messages = await i.channel.messages.fetch({ limit: 100 }),
        uid = i.options.getUser('usuario')?.id,
        bots = i.options.getBoolean('bots');
      const selected = messages
        .filter(
          (m) =>
            !m.pinned &&
            (!uid || m.author.id === uid) &&
            (!bots || m.author.bot) &&
            Date.now() - m.createdTimestamp < 14 * 86400000,
        )
        .first(i.options.getInteger('quantidade'));
      const deleted = selected.length ? await i.channel.bulkDelete(selected, true) : { size: 0 };
      await audit(
        ctx,
        i.guild,
        '🧹 Limpeza',
        `${i.user.tag} removeu ${deleted.size} mensagens de <#${i.channelId}>.`,
      );
      return reply(
        i,
        `${deleted.size} mensagem(ns) removida(s). Mensagens com 14 dias ou mais e fixadas são preservadas.`,
      );
    },
  ),
  D(
    'lock',
    'Bloqueia o envio de mensagens de @everyone neste canal.',
    'moderation',
    P.ManageChannels,
    [],
    async (i, ctx) => {
      await requireBot(i, P.ManageChannels);
      const key = `${i.guildId}:${i.channelId}`;
      if (ctx.store.get('locks', key)) throw new Error('Este canal já foi bloqueado pelo bot.');
      const current = i.channel.permissionOverwrites.cache.get(i.guildId);
      ctx.store.set('locks', key, {
        guild: i.guildId,
        channel: i.channelId,
        allow: current?.allow.has(P.SendMessages) ?? false,
        deny: current?.deny.has(P.SendMessages) ?? false,
      });
      await i.channel.permissionOverwrites.edit(i.guildId, { SendMessages: false });
      await audit(ctx, i.guild, '🔒 Canal bloqueado', `<#${i.channelId}> · ${i.user.tag}`);
      return reply(
        i,
        'Canal bloqueado para @everyone. Cargos com permissão explícita de envio podem continuar falando.',
      );
    },
  ),
  D(
    'unlock',
    'Restaura a permissão de envio anterior ao /lock.',
    'moderation',
    P.ManageChannels,
    [],
    async (i, ctx) => {
      await requireBot(i, P.ManageChannels);
      const key = `${i.guildId}:${i.channelId}`,
        old = ctx.store.get('locks', key);
      if (!old) throw new Error('Não há bloqueio registrado para restaurar.');
      await i.channel.permissionOverwrites.edit(i.guildId, {
        SendMessages: old.allow ? true : old.deny ? false : null,
      });
      ctx.store.delete('locks', key);
      await audit(ctx, i.guild, '🔓 Canal desbloqueado', `<#${i.channelId}> · ${i.user.tag}`);
      return reply(i, 'Permissão anterior restaurada.');
    },
  ),
  D(
    'slowmode',
    'Configura o modo lento do canal.',
    'moderation',
    P.ManageChannels,
    [integer('segundos', '0 desativa; até 21600', true, 0, 21600)],
    async (i) => {
      await requireBot(i, P.ManageChannels);
      if (!i.channel?.setRateLimitPerUser) throw new Error('Canal incompatível.');
      await i.channel.setRateLimitPerUser(i.options.getInteger('segundos'));
      return reply(i, 'Modo lento atualizado.');
    },
  ),
  D(
    'apelido',
    'Altera ou restaura o apelido de um membro.',
    'moderation',
    P.ManageNicknames,
    [user(), text('nome', 'Vazio restaura o nome original', false, { max_length: 32 })],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.ManageNicknames);
      if (!m) throw new Error('Membro não encontrado.');
      await m.setNickname(i.options.getString('nome') ?? null);
      await record(i, ctx, u, 'NICKNAME', i.options.getString('nome') ?? 'Restaurado');
      return reply(i, 'Apelido atualizado.');
    },
  ),
  D(
    'cargo',
    'Adiciona ou remove um cargo comum de um membro.',
    'moderation',
    P.ManageRoles,
    [
      sub('adicionar', 'Adiciona um cargo sem privilégios', [user(), role()]),
      sub('remover', 'Remove um cargo comum', [user(), role()]),
    ],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.ManageRoles);
      if (!m) throw new Error('Membro não encontrado.');
      const r = await validateRole(i.guild, i.options.getRole('cargo').id, i.user.id);
      await m.roles[i.options.getSubcommand() === 'adicionar' ? 'add' : 'remove'](
        r,
        `Solicitado por ${i.user.tag}`,
      );
      await record(i, ctx, u, 'ROLE', `${i.options.getSubcommand()} ${r.name}`);
      return reply(i, 'Cargo atualizado.');
    },
  ),
];
for (const [name, description, permission, field, value] of [
  ['silenciar', 'Silencia um membro em voz.', P.MuteMembers, 'setMute', true],
  ['dessilenciar', 'Remove o silêncio em voz.', P.MuteMembers, 'setMute', false],
  ['ensurdecer', 'Ensurdece um membro em voz.', P.DeafenMembers, 'setDeaf', true],
  ['desensurdecer', 'Remove o ensurdecimento em voz.', P.DeafenMembers, 'setDeaf', false],
  ['desconectar', 'Desconecta um membro de voz.', P.MoveMembers, 'disconnect', null],
])
  moderation.push(
    D(
      name,
      description,
      'moderation',
      permission,
      [user(), text('motivo', 'Motivo')],
      async (i, ctx) => {
        const u = i.options.getUser('usuario'),
          m = await moderateTarget(i, u, permission);
        if (!m?.voice.channelId) throw new Error('O membro não está em um canal de voz.');
        if (field === 'disconnect') await m.voice.disconnect(reason(i));
        else await m.voice[field](value, reason(i));
        await record(i, ctx, u, name.toUpperCase(), reason(i));
        return reply(i, 'Estado de voz atualizado.');
      },
    ),
  );
moderation.push(
  D(
    'mover',
    'Move um membro para um canal de voz.',
    'moderation',
    P.MoveMembers,
    [
      user(),
      {
        type: 7,
        name: 'destino',
        description: 'Canal de voz de destino',
        required: true,
        channel_types: [2],
      },
    ],
    async (i, ctx) => {
      const u = i.options.getUser('usuario'),
        m = await moderateTarget(i, u, P.MoveMembers);
      if (!m?.voice.channelId) throw new Error('O membro não está em voz.');
      await m.voice.setChannel(i.options.getChannel('destino'));
      await record(i, ctx, u, 'MOVE', 'Movido de canal');
      return reply(i, 'Membro movido.');
    },
  ),
);
export default moderation;
