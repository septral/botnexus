import { Events, PermissionFlagsBits as P } from 'discord.js';
import { validateRole } from '../core/permissions.js';
import { embed, safe, truncate, levelFor, time } from '../core/ui.js';
import { audit, log } from '../core/log.js';
import { trackTicketMessage } from './tickets.js';
import { handleTempCallVoiceState } from './tempcalls.js';
import { hasActiveBuff } from './vip.js';
import { createBoosterCoupon } from './shop.js';
const words = (text) => text.normalize('NFKC').toLocaleLowerCase('pt-BR');
export function automodReason(message, config, history = []) {
  const text = message.content ?? '',
    a = config.automod,
    now = Date.now(),
    timestamp = (entry) => (typeof entry === 'number' ? entry : entry.at);
  if (a.invites && /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-z0-9-]+/i.test(text))
    return 'Convite externo';
  if (a.links && /https?:\/\/\S+/i.test(text)) return 'Link bloqueado';
  if (
    a.spam &&
    history.filter((t) => now - timestamp(t) < a.spamWindowSeconds * 1000).length >= a.spamMessages
  )
    return 'Rajada de mensagens';
  if (
    a.duplicates > 0 &&
    text.trim().length >= 4 &&
    history.filter(
      (entry) =>
        typeof entry === 'object' &&
        now - entry.at < a.duplicateWindowSeconds * 1000 &&
        words(entry.content) === words(text.trim()),
    ).length >= a.duplicates
  )
    return 'Mensagens repetidas';
  if (
    a.mentions > 0 &&
    ((message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0) >= a.mentions ||
      message.mentions?.everyone)
  )
    return 'Excesso de menções';
  const letters = text.match(/\p{L}/gu) ?? [];
  if (
    a.capsPercent > 0 &&
    letters.length >= 12 &&
    (letters.filter((v) => v.toLocaleUpperCase('pt-BR') === v && v.toLocaleLowerCase('pt-BR') !== v)
      .length /
      letters.length) *
      100 >=
      a.capsPercent
  )
    return 'Excesso de maiúsculas';
  if (a.maxLines > 0 && text.split(/\r?\n/).length > a.maxLines) return 'Excesso de linhas';
  const emojiCount = (text.match(/<a?:\w{2,32}:\d{17,20}>|\p{Extended_Pictographic}/gu) ?? [])
    .length;
  if (a.maxEmojis > 0 && emojiCount > a.maxEmojis) return 'Excesso de emojis';
  if (
    a.newAccountHours > 0 &&
    message.author?.createdTimestamp &&
    now - message.author.createdTimestamp < a.newAccountHours * 3600000
  )
    return 'Conta muito recente';
  if (a.blockFiles && message.attachments?.size) {
    const blocked = new Set(
      a.blockedExtensions
        .split(/\s+/)
        .map((v) => v.toLowerCase().replace(/^\./, ''))
        .filter(Boolean),
    );
    if (
      message.attachments.some((file) =>
        blocked.has(
          String(file.name ?? '')
            .split('.')
            .at(-1)
            .toLowerCase(),
        ),
      )
    )
      return 'Tipo de arquivo bloqueado';
  }
  if (
    a.words
      .split('\n')
      .map((v) => words(v.trim()))
      .filter(Boolean)
      .some((w) => words(text).includes(w))
  )
    return 'Expressão bloqueada';
  return null;
}
export function bindEvents(ctx) {
  const history = new Map(),
    punished = new Map(),
    mentionNotices = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, list] of history)
      if (
        !list.length ||
        now - (typeof list.at(-1) === 'number' ? list.at(-1) : list.at(-1).at) > 300000
      )
        history.delete(key);
    for (const map of [punished, mentionNotices])
      for (const [key, t] of map) if (now - t > 60000) map.delete(key);
  }, 60000);
  cleanup.unref();
  const on = (event, run) =>
    ctx.client.on(event, (...args) =>
      Promise.resolve(run(...args)).catch((e) =>
        log('error', 'event_failed', { event, error: e.message }),
      ),
    );
  on(Events.GuildMemberAdd, async (member) => {
    const c = ctx.store.config(member.guild.id);
    if (!c.modules.community || member.user.bot) return;
    if (c.welcome.roleId) {
      try {
        const role = await validateRole(member.guild, c.welcome.roleId);
        await member.roles.add(role, 'Cargo automático de entrada');
      } catch (e) {
        log('warn', 'welcome_role_failed', { guild: member.guild.id, error: e.message });
      }
    }
    const body = c.welcome.message
      .replaceAll('{user}', `<@${member.id}>`)
      .replaceAll('{username}', safe(member.user.username))
      .replaceAll('{server}', safe(member.guild.name))
      .replaceAll('{count}', String(member.guild.memberCount));
    if (c.welcome.channelId) {
      const ch = await member.guild.channels.fetch(c.welcome.channelId);
      await ch.send({
        embeds: [
          embed(c, '🏥 ADMISSÃO / BOAS-VINDAS', body).setThumbnail(member.user.displayAvatarURL()),
        ],
        allowedMentions: { users: [member.id], parse: [] },
      });
    }
    if (c.welcome.dm)
      await member
        .send({
          embeds: [embed(c, `Bem-vindo(a) ao ${member.guild.name}`, body)],
          allowedMentions: { parse: [] },
        })
        .catch((e) => log('warn', 'welcome_dm_failed', { error: e.code }));
    if (c.logs.members)
      await audit(
        ctx,
        member.guild,
        '📥 Entrada de membro',
        `${member.user.tag} (${member.id})`,
        'members',
      );
  });
  on(Events.GuildMemberUpdate, async (before, member) => {
    if (member.user.bot || before.premiumSinceTimestamp || !member.premiumSinceTimestamp) return;
    const config = ctx.store.config(member.guild.id);
    if (!config.modules.economy) return;
    const existing = ctx.store.get('booster-coupons', `${member.guild.id}:${member.id}`);
    if (existing?.active && !existing.usedAt) return;
    const code = createBoosterCoupon(ctx, member.guild.id, member.id);
    await member
      .send({
        embeds: [
          embed(
            config,
            '🚀 Obrigado pelo boost!',
            `Seu apoio desbloqueou um cupom pessoal de **50% de desconto em moedas** para comprar qualquer VIP na loja.\n\n**Cupom:** \`${code}\`\n\nAbra o painel da loja, escolha um VIP e informe o cupom na finalização.`,
          ),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  });
  on(Events.GuildMemberRemove, async (member) => {
    const c = ctx.store.config(member.guild.id);
    if (!c.modules.community) return;
    if (c.welcome.goodbyeChannelId) {
      const ch = await member.guild.channels.fetch(c.welcome.goodbyeChannelId);
      await ch.send({
        embeds: [
          embed(
            c,
            '🚪 ALTA / SAÍDA',
            c.welcome.goodbyeMessage
              .replaceAll('{user}', safe(member.user.username))
              .replaceAll('{username}', safe(member.user.username))
              .replaceAll('{server}', safe(member.guild.name))
              .replaceAll('{count}', String(member.guild.memberCount)),
          ),
        ],
        allowedMentions: { parse: [] },
      });
    }
    if (c.logs.members)
      await audit(
        ctx,
        member.guild,
        '📤 Saída de membro',
        `${member.user.tag} (${member.id})`,
        'members',
      );
  });
  on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return;
    await trackTicketMessage(message, ctx);
    const c = ctx.store.config(message.guildId),
      key = `${message.guildId}:${message.author.id}`,
      now = Date.now(),
      member = message.member;
    if (
      c.modules.automod &&
      c.automod.enabled &&
      member &&
      !member.permissions.has(P.ManageMessages) &&
      !c.automod.ignoredChannels.split(/\s+/).includes(message.channelId) &&
      !c.automod.ignoredRoles.split(/\s+/).some((id) => member.roles.cache.has(id))
    ) {
      const historyWindow =
        Math.max(c.automod.spamWindowSeconds, c.automod.duplicateWindowSeconds) * 1000;
      const previous = (history.get(key) ?? []).filter(
        (entry) => now - (typeof entry === 'number' ? entry : entry.at) < historyWindow,
      );
      previous.push({ at: now, content: message.content.trim() });
      history.set(key, previous);
      const reason = automodReason(message, c, previous);
      if (reason) {
        if (c.automod.deleteMessages && message.deletable) await message.delete();
        const strikeKey = `${message.guildId}:${message.author.id}`;
        const strikeRecord = ctx.store.get('automod-strikes', strikeKey) ?? { timestamps: [] };
        strikeRecord.timestamps = strikeRecord.timestamps.filter(
          (timestamp) => now - timestamp < c.automod.violationWindowMinutes * 60000,
        );
        strikeRecord.timestamps.push(now);
        strikeRecord.lastReason = reason;
        ctx.store.set('automod-strikes', strikeKey, strikeRecord);
        const shouldTimeout =
          c.automod.timeoutMinutes > 0 &&
          strikeRecord.timestamps.length >= c.automod.timeoutAfterViolations;
        if (shouldTimeout || now - (punished.get(key) ?? 0) > 10000) {
          punished.set(key, now);
          ctx.store.addCase(
            message.guildId,
            message.author.id,
            ctx.client.user.id,
            'AUTOMOD',
            reason,
          );
          if (shouldTimeout && member.moderatable) {
            await member.timeout(c.automod.timeoutMinutes * 60000, reason);
            strikeRecord.timestamps = [];
            ctx.store.set('automod-strikes', strikeKey, strikeRecord);
          }
          if (c.automod.warnDm)
            await message.author
              .send({
                embeds: [
                  embed(
                    c,
                    `Moderação automática em ${message.guild.name}`,
                    `Sua mensagem em <#${message.channelId}> foi sinalizada por **${safe(reason)}**.\n\nInfração ${Math.min(strikeRecord.timestamps.length || c.automod.timeoutAfterViolations, c.automod.timeoutAfterViolations)}/${c.automod.timeoutAfterViolations}.${shouldTimeout ? ` Foi aplicado um timeout de ${c.automod.timeoutMinutes} minuto(s).` : ' Revise a mensagem antes de tentar novamente.'}`,
                  ),
                ],
                allowedMentions: { parse: [] },
              })
              .catch(() => {});
          await audit(
            ctx,
            message.guild,
            '🚨 CONTENÇÃO AUTOMÁTICA',
            `<@${message.author.id}> · ${reason} · <#${message.channelId}> · ${shouldTimeout ? `timeout ${c.automod.timeoutMinutes}m` : `aviso ${strikeRecord.timestamps.length}/${c.automod.timeoutAfterViolations}`}`,
          );
        }
        return;
      }
    }
    if (c.modules.community) {
      const own = ctx.store.get('afk', key);
      if (own) {
        ctx.store.delete('afk', key);
        await message.reply({
          content: `🟣 ${safe(message.author.username)} voltou ao plantão.`,
          allowedMentions: { parse: [], repliedUser: false },
        });
      }
      const absent = [];
      for (const u of message.mentions.users.first(5)) {
        const target = `${message.guildId}:${u.id}`,
          afk = ctx.store.get('afk', target),
          noticeKey = `${key}:${u.id}`;
        if (afk && now - (mentionNotices.get(noticeKey) ?? 0) > 60000) {
          mentionNotices.set(noticeKey, now);
          absent.push(
            `**${safe(u.username)}** está ausente ${time(afk.since)}: ${safe(afk.reason)}`,
          );
        }
      }
      if (absent.length)
        await message.reply({
          content: absent.join('\n'),
          allowedMentions: { parse: [], repliedUser: false },
        });
    }
    if (c.modules.levels && message.content.trim().length >= 3) {
      const a = ctx.store.account(message.guildId, message.author.id);
      if (now - a.last_xp < c.levels.cooldownSeconds * 1000) return;
      const old = levelFor(a.xp),
        xpGain =
          c.levels.xpPerMessage *
          (hasActiveBuff(ctx, message.guildId, message.author.id, 'xp') ? 2 : 1),
        next = ctx.store.changeAccount(message.guildId, message.author.id, {
          xp: a.xp + xpGain,
          last_xp: now,
        }),
        level = levelFor(next.xp);
      if (level <= old) return;
      for (const line of c.levels.rewards.split('\n').filter(Boolean)) {
        const [required, id] = line.split(':');
        if (Number(required) > old && Number(required) <= level) {
          try {
            const role = await validateRole(message.guild, id);
            await member.roles.add(role, `Recompensa de nível ${level}`);
          } catch (e) {
            log('warn', 'level_reward_failed', { guild: message.guildId, error: e.message });
          }
        }
      }
      if (c.levels.announceChannelId) {
        const ch = await message.guild.channels.fetch(c.levels.announceChannelId);
        await ch.send({
          embeds: [
            embed(
              c,
              '📈 EVOLUÇÃO / NÍVEL',
              `<@${message.author.id}> alcançou o **nível ${level}**!`,
            ),
          ],
          allowedMentions: { users: [message.author.id], parse: [] },
        });
      }
    }
  });
  on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return;
    const c = ctx.store.config(message.guild.id);
    if (!c.logs.messages || message.channelId === c.logs.channelId) return;
    await audit(
      ctx,
      message.guild,
      '🗑️ Mensagem removida',
      `**Autor:** ${message.author ? `${message.author.tag} (${message.author.id})` : 'Fora do cache'}\n**Canal:** <#${message.channelId}>\n**Conteúdo em cache:** ${safe(truncate(message.content ?? 'Indisponível', 1500))}`,
      'messages',
    );
  });
  on(Events.MessageUpdate, async (old, message) => {
    if (!message.guild || message.author?.bot || old.content === message.content) return;
    const c = ctx.store.config(message.guild.id);
    if (!c.logs.messages || message.channelId === c.logs.channelId) return;
    await audit(
      ctx,
      message.guild,
      '✏️ Mensagem editada',
      `**Autor:** ${message.author?.tag ?? 'Fora do cache'}\n**Canal:** <#${message.channelId}>\n**Antes:** ${safe(truncate(old.content ?? 'Indisponível', 1000))}\n**Depois:** ${safe(truncate(message.content ?? 'Indisponível', 1000))}`,
      'messages',
    );
  });
  on(Events.ChannelDelete, async (channel) => {
    const t = ctx.store.get('tickets', channel.id);
    if (t) {
      t.closed = true;
      t.deleted = true;
      t.deleteAt = null;
      ctx.store.set('tickets', channel.id, t);
    }
    const call = ctx.store.get('tempcalls', channel.id);
    if (call) {
      call.deleted = true;
      call.deletedAt = Date.now();
      ctx.store.set('tempcalls', channel.id, call);
    }
  });
  on(Events.VoiceStateUpdate, (oldState, newState) =>
    handleTempCallVoiceState(oldState, newState, ctx),
  );
}
