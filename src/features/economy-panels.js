import { ButtonStyle } from 'discord.js';
import { randomInt } from 'node:crypto';
import { embed, fmt, reply, row, safe, time, button } from '../core/ui.js';
import { requireUser } from '../core/permissions.js';
import { hasActiveBuff, memberVipTier, vipWorkMultiplier } from './vip.js';

const scratchPrizes = [
  { amount: 0, weight: 6000, label: 'Nada desta vez' },
  { amount: 100, weight: 2000, label: 'Prêmio pequeno' },
  { amount: 250, weight: 1000, label: 'Prêmio comum' },
  { amount: 500, weight: 600, label: 'Prêmio bom' },
  { amount: 2500, weight: 250, label: 'Prêmio raro' },
  { amount: 10000, weight: 100, label: 'Prêmio épico' },
  { amount: 100000, weight: 40, label: 'Prêmio lendário' },
  { amount: 5000000, weight: 1, label: 'JACKPOT N3XUS' },
];

const scratchChanceMultiplier = (member, config) =>
  ({ vip: 1.1, vip_plus: 1.25, vip_nexus: 1.5 }[memberVipTier(member, config)] ?? 1);

const scratchPrizeChance = (multiplier) => {
  const zero = scratchPrizes[0].weight;
  const positive = scratchPrizes.slice(1).reduce((sum, prize) => sum + prize.weight, 0) * multiplier;
  return positive / (zero + positive);
};

const pickPrize = (maximum = 5000000, multiplier = 1) => {
  const weighted = scratchPrizes.map((prize, index) => ({ ...prize, weight: index === 0 ? prize.weight : Math.max(1, Math.round(prize.weight * multiplier)) }));
  const total = weighted.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = randomInt(total);
  for (const prize of weighted) {
    cursor -= prize.weight;
    if (cursor < 0) return { ...prize, amount: Math.min(prize.amount, maximum) };
  }
  return scratchPrizes[0];
};

export function workPanelView(config, guild) {
  const role = (id) => (id ? `<@&${id}>` : 'não configurado');
  const boosterRole = guild?.roles?.premiumSubscriberRole?.id;
  const panel = embed(config, '💼 Central de trabalho', `Trabalhe uma vez por intervalo e construa seu saldo com constância. O valor base começa em **${fmt.format(config.economy.workMin)} ${safe(config.economy.currency)}** e recebe os bônus do seu perfil.`)
    .addFields(
      { name: '⏱️ Ritmo', value: `Uma recompensa a cada **${config.economy.workCooldownMinutes} minutos**.`, inline: true },
      { name: '🪙 Faixa base', value: `**${fmt.format(config.economy.workMin)}–${fmt.format(config.economy.workMax)} ${safe(config.economy.currency)}**`, inline: true },
      { name: '💎 Multiplicadores', value: `${role(config.vip?.normalRoleId)} · ${config.economy.vipNormalMultiplier}%\n${role(config.vip?.plusRoleId)} · ${config.economy.vipPlusMultiplier}%\n${role(config.vip?.nexusRoleId)} · ${config.economy.vipNexusMultiplier}%\n${boosterRole ? `<@&${boosterRole}>` : 'Boosters'} · **300%**`, inline: false },
      { name: '🛍️ Onde comprar', value: 'VIPs e buffs estão disponíveis em <#1564440848966357012>.', inline: false },
    )
    .setFooter({ text: 'Clique em Trabalhar para receber sua recompensa.' });
  return {
    embeds: [panel],
    components: [row(button('work:claim', 'Trabalhar', ButtonStyle.Success))],
    allowedMentions: { parse: [] },
  };
}

export function scratchPanelView(config, guild) {
  const role = (id) => (id ? `<@&${id}>` : 'não configurado');
  const boosterRole = guild?.roles?.premiumSubscriberRole?.id;
  const normalChance = (scratchPrizeChance(1.1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const plusChance = (scratchPrizeChance(1.25) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const nexusChance = (scratchPrizeChance(1.5) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const panel = embed(config, '🎟️ Raspadinha N3XUS', `Uma tentativa rápida, com resultado imediato e jackpot de **${fmt.format(config.economy.scratchJackpot)} ${safe(config.economy.currency)}**. O maior prêmio é raro de propósito.`)
    .addFields(
      { name: '🎫 Participação', value: `**${fmt.format(config.economy.scratchPrice)} ${safe(config.economy.currency)}** por tentativa.`, inline: true },
      { name: '🏆 Faixa de prêmios', value: `De **0** até **${fmt.format(config.economy.scratchJackpot)} ${safe(config.economy.currency)}**.`, inline: true },
      { name: '💎 Chances por cargo', value: `${role(config.vip?.normalRoleId)} · **${normalChance}%** de chance de qualquer prêmio\n${role(config.vip?.plusRoleId)} · **${plusChance}%** de chance de qualquer prêmio\n${role(config.vip?.nexusRoleId)} · **${nexusChance}%** de chance de qualquer prêmio\nSem VIP · **${(scratchPrizeChance(1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%**`, inline: false },
      { name: '🚀 Booster', value: `${boosterRole ? `<@&${boosterRole}>` : 'Boosters'} mantêm a chance padrão nesta raspadinha.`, inline: false },
      { name: '🛍️ VIPs e buffs', value: 'Compre planos VIP e buffs em <#1564440848966357012>.', inline: false },
    )
    .setFooter({ text: 'Boa sorte — jogue com responsabilidade.' });
  return {
    embeds: [panel],
    components: [row(button('scratch:buy', 'Comprar raspadinha', ButtonStyle.Primary))],
    allowedMentions: { parse: [] },
  };
}

export function workReward(i, ctx) {
  const config = ctx.store.config(i.guildId);
  const now = Date.now();
  if (config.economy.workChannelId && i.channelId !== config.economy.workChannelId)
    throw new Error(`Use o painel de trabalho em <#${config.economy.workChannelId}>.`);
  const base = randomInt(config.economy.workMin, config.economy.workMax + 1);
  const vipMultiplier = vipWorkMultiplier(i.member, config);
  const buffMultiplier = hasActiveBuff(ctx, i.guildId, i.user.id, 'work') ? 1.5 : 1;
  const amount = Math.floor(base * (vipMultiplier / 100) * buffMultiplier);
  ctx.store.transaction(() => {
    const account = ctx.store.account(i.guildId, i.user.id);
    const next = account.last_work + config.economy.workCooldownMinutes * 60000;
    if (now < next) throw new Error(`Seu próximo plantão estará disponível ${time(next)}.`);
    ctx.store.changeAccount(i.guildId, i.user.id, { balance: account.balance + amount, last_work: now });
  });
  return { amount, vipMultiplier, buffMultiplier, currency: config.economy.currency };
}

export async function runWork(i, ctx) {
  const result = workReward(i, ctx);
  return reply(i, `💼 Trabalho concluído. Você recebeu **${fmt.format(result.amount)} ${safe(result.currency)}**.${result.vipMultiplier > 100 ? ` Multiplicador ativo: ${result.vipMultiplier}%.` : ''}${result.buffMultiplier > 1 ? ' Buff temporário: +50%.' : ''}`);
}

export async function publishWorkPanel(i, ctx, channel = i.channel) {
  requireUser(i, 32);
  if (!channel?.isTextBased()) throw new Error('Escolha um canal de texto.');
  const previous = ctx.store.get('work-panels', i.guildId);
  if (previous?.channel && previous?.message) {
    const oldChannel = await i.guild.channels.fetch(previous.channel).catch(() => null);
    await oldChannel?.messages.delete(previous.message).catch(() => {});
  }
  const message = await channel.send(workPanelView(ctx.store.config(i.guildId), i.guild));
  const config = ctx.store.config(i.guildId);
  config.economy.workChannelId = channel.id;
  config.economy.workPanelChannelId = channel.id;
  ctx.store.saveConfig(i.guildId, config);
  ctx.store.set('work-panels', i.guildId, { guild: i.guildId, channel: channel.id, message: message.id, updatedAt: Date.now() });
  return message;
}

export async function publishScratchPanel(i, ctx, channel = i.channel) {
  requireUser(i, 32);
  if (!channel?.isTextBased()) throw new Error('Escolha um canal de texto.');
  const previous = ctx.store.get('scratch-panels', i.guildId);
  if (previous?.channel && previous?.message) {
    const oldChannel = await i.guild.channels.fetch(previous.channel).catch(() => null);
    await oldChannel?.messages.delete(previous.message).catch(() => {});
  }
  const message = await channel.send(scratchPanelView(ctx.store.config(i.guildId), i.guild));
  const config = ctx.store.config(i.guildId);
  config.economy.scratchChannelId = channel.id;
  ctx.store.saveConfig(i.guildId, config);
  ctx.store.set('scratch-panels', i.guildId, { guild: i.guildId, channel: channel.id, message: message.id, updatedAt: Date.now() });
  return message;
}

export async function buyScratch(i, ctx) {
  const config = ctx.store.config(i.guildId);
  const result = ctx.store.transaction(() => {
    const account = ctx.store.account(i.guildId, i.user.id);
    if (account.balance < config.economy.scratchPrice)
      throw new Error(`Você precisa de mais ${fmt.format(config.economy.scratchPrice - account.balance)} ${safe(config.economy.currency)}.`);
    const chanceMultiplier = scratchChanceMultiplier(i.member, config);
    const prize = pickPrize(config.economy.scratchJackpot, chanceMultiplier);
    ctx.store.changeAccount(i.guildId, i.user.id, { balance: account.balance - config.economy.scratchPrice + prize.amount });
    ctx.store.set('scratch-results', i.id, { id: i.id, guild: i.guildId, user: i.user.id, cost: config.economy.scratchPrice, prize: prize.amount, chanceMultiplier, createdAt: Date.now() });
    return prize;
  });
  const title = result.amount >= 100000 ? '🎉 Prêmio extraordinário!' : result.amount > 0 ? '✨ Raspadinha premiada!' : '🍀 Tente novamente';
  return reply(i, { embeds: [embed(config, title, result.amount ? `Você ganhou **${fmt.format(result.amount)} ${safe(config.economy.currency)}**!\n\nResultado: **${result.label}**` : `Esta raspadinha não trouxe prêmio.\n\nResultado: **${result.label}**`)] });
}

export async function economyPanelComponent(i, ctx) {
  const [prefix, action] = i.customId.split(':');
  if (prefix === 'work' && action === 'claim') return runWork(i, ctx);
  if (prefix === 'scratch' && action === 'buy') return buyScratch(i, ctx);
  throw new Error('Painel de economia inválido.');
}
