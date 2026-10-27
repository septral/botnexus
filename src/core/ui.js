import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
export const fmt = new Intl.NumberFormat('pt-BR');
export const percent = (n) =>
  `${Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const truncate = (s, n = 1000) => String(s ?? '').slice(0, n);
export const safe = (s) => escapeMarkdown(String(s ?? '')).replace(/@/g, '＠');
export const time = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;
export const onoff = (v) => (v ? '🟣 Ativado' : '⚫ Desativado');
export function embed(config, title, description = '') {
  return new EmbedBuilder()
    .setColor(config.appearance.color)
    .setTitle(truncate(title, 256))
    .setDescription(truncate(description || '\u200b', 4096))
    .setFooter({ text: config.appearance.footer })
    .setTimestamp();
}
export const row = (...components) => new ActionRowBuilder().addComponents(...components);
export const button = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
export const privatePayload = (content) =>
  typeof content === 'string'
    ? { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }
    : { ...content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
export async function defer(i) {
  if (!i.deferred && !i.replied)
    return i.deferReply(i.nexusEphemeral === false ? {} : { flags: MessageFlags.Ephemeral });
}
export async function update(i, payload) {
  return i.deferred || i.replied ? i.editReply(payload) : i.update(payload);
}
export async function reply(i, payload, ephemeral = i.nexusEphemeral !== false) {
  const data = typeof payload === 'string' ? { content: payload } : payload;
  const out = { ...data, allowedMentions: data.allowedMentions ?? { parse: [] } };
  if (i.deferred || i.replied) {
    delete out.flags;
    return i.editReply(out);
  }
  return i.reply(ephemeral ? { ...out, flags: (out.flags ?? 0) | MessageFlags.Ephemeral } : out);
}
export function progress(value, size = 16) {
  const fill = Math.max(0, Math.min(size, Math.round(((value || 0) * size) / 100)));
  return '▰'.repeat(fill) + '▱'.repeat(size - fill);
}
export function parseDuration(text, max = 365 * 86400000) {
  const m = /^(\d+)(s|m|h|d)$/i.exec(String(text));
  if (!m) throw new Error('Use uma duração como 30s, 10m, 2h ou 7d.');
  const ms = Number(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
  if (ms < 1000 || ms > max)
    throw new Error(`Duração fora do limite (máximo ${Math.floor(max / 86400000)} dia(s)).`);
  return ms;
}
export const levelFor = (xp) => Math.floor(Math.sqrt(xp / 100));
export const requiredXp = (level) => level * level * 100;
