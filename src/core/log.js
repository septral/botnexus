import { embed, truncate } from './ui.js';
const priorities = { debug: 10, info: 20, warn: 30, error: 40 };
let writer = null;

const redactValue = (key, value) => {
  if (['token', 'authorization', 'apikey', 'api_key'].includes(key.toLowerCase()))
    return '[REDACTED]';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'string') return value;
  return [process.env.DISCORD_TOKEN, process.env.GROQ_API_KEY, process.env.GEMINI_API_KEY]
    .filter(Boolean)
    .reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), value);
};

export const formatLogRecord = (record, colors = false) => {
  const palette = colors
    ? { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' }
    : { debug: '', info: '', warn: '', error: '', reset: '' };
  const { time, level, event, ...detail } = record;
  const extra = Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : '';
  return `${palette[level] ?? ''}[${new Date(time).toLocaleTimeString('pt-BR')}] ${level.toUpperCase().padEnd(5)} ${event}${palette.reset}${extra}`;
};

export function setLogWriter(next) {
  writer = typeof next === 'function' ? next : null;
}

export function log(level, event, detail = {}) {
  const configured = process.env.LOG_LEVEL?.toLowerCase() || 'info';
  if ((priorities[level] ?? priorities.info) < (priorities[configured] ?? priorities.info)) return;
  const record = JSON.parse(
    JSON.stringify({ time: new Date().toISOString(), level, event, ...detail }, redactValue),
  );
  if (writer) {
    try {
      writer(record);
      return;
    } catch {
      writer = null;
    }
  }
  const output = process.stdout.isTTY ? formatLogRecord(record, true) : JSON.stringify(record);
  console[level === 'error' ? 'error' : 'log'](output);
}
export async function audit(ctx, guild, title, description, kind = 'moderation') {
  const c = ctx.store.config(guild.id);
  if (!c.logs.channelId || c.logs[kind] === false) return;
  try {
    const channel = await guild.channels.fetch(c.logs.channelId);
    if (channel?.isTextBased())
      await channel.send({
        embeds: [embed(c, title, truncate(description, 3900))],
        allowedMentions: { parse: [] },
      });
  } catch (e) {
    log('error', 'audit_failed', { guild: guild.id, error: e.message });
  }
}
