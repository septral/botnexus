import {
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { log } from '../core/log.js';

export async function joinBotVoice(ctx, guild, channel, actorId = null) {
  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type))
    throw new Error('Escolha um canal de voz ou palco.');
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const permissions = channel.permissionsFor(me);
  if (!permissions.has(P.ViewChannel) || !permissions.has(P.Connect))
    throw new Error('O bot precisa de Ver canal e Conectar nessa call.');
  getVoiceConnection(guild.id)?.destroy();
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });
  connection.on('error', (error) =>
    log('warn', 'bot_voice_connection_error', {
      guild: guild.id,
      channel: channel.id,
      error: error.message,
    }),
  );
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
  } catch {
    connection.destroy();
    throw new Error('A conexão de voz não ficou pronta. Confira as permissões e tente novamente.');
  }
  ctx.store.set('bot-voice', guild.id, {
    guild: guild.id,
    channel: channel.id,
    actor: actorId,
    connectedAt: Date.now(),
    persistent: true,
  });
  return connection;
}

export function leaveBotVoice(ctx, guildId) {
  const connection = getVoiceConnection(guildId);
  connection?.destroy();
  ctx.store.delete('bot-voice', guildId);
  return Boolean(connection);
}

export async function restoreBotVoiceConnections(ctx) {
  for (const record of ctx.store.list('bot-voice').filter((item) => item.persistent)) {
    const guild = ctx.client.guilds.cache.get(record.guild);
    if (!guild) continue;
    const channel = await guild.channels.fetch(record.channel).catch(() => null);
    if (!channel) {
      ctx.store.delete('bot-voice', record.guild);
      continue;
    }
    await joinBotVoice(ctx, guild, channel).catch((error) =>
      log('warn', 'bot_voice_restore_failed', {
        guild: record.guild,
        channel: record.channel,
        error: error.message,
      }),
    );
  }
}
