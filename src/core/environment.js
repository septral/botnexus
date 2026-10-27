export function environment({ requireToken = true } = {}) {
  const token = process.env.DISCORD_TOKEN ?? '',
    clientId = process.env.DISCORD_CLIENT_ID ?? '',
    guildId = process.env.DISCORD_GUILD_ID ?? '';
  if (requireToken && (!token || !/^\d{17,20}$/.test(clientId)))
    throw new Error(
      'Preencha DISCORD_TOKEN e DISCORD_CLIENT_ID no .env. Copie .env.example para .env e consulte LEIA-ME.md.',
    );
  if (guildId && !/^\d{17,20}$/.test(guildId)) throw new Error('DISCORD_GUILD_ID inválido.');
  const port = Number(process.env.HEALTH_PORT ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('HEALTH_PORT deve ser 0 ou uma porta de 1 a 65535.');
  const clearMinutes = Number(process.env.CONSOLE_CLEAR_MINUTES ?? 30);
  if (!Number.isFinite(clearMinutes) || clearMinutes < 0 || clearMinutes > 1440)
    throw new Error('CONSOLE_CLEAR_MINUTES deve estar entre 0 e 1440.');
  return {
    token,
    clientId,
    guildId,
    database: process.env.DATABASE_PATH || './data/sanatorio.sqlite',
    members: process.env.ENABLE_MEMBERS_INTENT !== 'false',
    messageContent: process.env.ENABLE_MESSAGE_CONTENT_INTENT !== 'false',
    presences: process.env.ENABLE_PRESENCES_INTENT === 'true',
    port,
    autoDeploy: process.env.AUTO_DEPLOY_COMMANDS !== 'false',
    deployScope: process.env.AUTO_DEPLOY_SCOPE || 'auto',
    interactiveConsole: process.env.INTERACTIVE_CONSOLE !== 'false',
    consoleClearMinutes: clearMinutes,
  };
}
