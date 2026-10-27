import { REST, Routes } from 'discord.js';
import { log } from './log.js';

export const commandPayload = (commandList, global = false) =>
  commandList.map((command) => {
    const data = structuredClone(command.data);
    if (!global) {
      delete data.contexts;
      delete data.integration_types;
    }
    return data;
  });

const changes = (before, after) => {
  const oldNames = new Set(before.map((command) => command.name));
  const newNames = new Set(after.map((command) => command.name));
  return {
    added: [...newNames].filter((name) => !oldNames.has(name)),
    removed: [...oldNames].filter((name) => !newNames.has(name)),
  };
};

async function sync(rest, route, body, label) {
  const before = await rest.get(route);
  const diff = changes(Array.isArray(before) ? before : [], body);
  log('info', 'commands_deploy_started', {
    scope: label,
    commands: body.length,
    added: diff.added,
    removed: diff.removed,
  });
  const result = await rest.put(route, { body });
  log('info', 'commands_deploy_finished', {
    scope: label,
    commands: Array.isArray(result) ? result.length : body.length,
    removed: diff.removed.length,
  });
  return { scope: label, commands: body.length, ...diff };
}

export async function deployCommands(env, commandList, { scope = env.deployScope } = {}) {
  const rest = new REST({ version: '10', timeout: 20000, retries: 3 }).setToken(env.token);
  const selected = scope || 'auto';
  if (!['auto', 'guild', 'global', 'both'].includes(selected))
    throw new Error('AUTO_DEPLOY_SCOPE deve ser auto, guild, global ou both.');
  if (['guild', 'both'].includes(selected) && !env.guildId)
    throw new Error('DISCORD_GUILD_ID é obrigatório para deploy no servidor.');

  const results = [];
  const syncGuild = ['guild', 'both'].includes(selected) || (selected === 'auto' && env.guildId);
  const syncGlobal = ['global', 'both'].includes(selected) || (selected === 'auto' && !env.guildId);

  if (syncGuild)
    results.push(
      await sync(
        rest,
        Routes.applicationGuildCommands(env.clientId, env.guildId),
        commandPayload(commandList, false),
        `guild:${env.guildId}`,
      ),
    );
  if (syncGlobal)
    results.push(
      await sync(
        rest,
        Routes.applicationCommands(env.clientId),
        commandPayload(commandList, true),
        'global',
      ),
    );

  // No modo automático, um catálogo global antigo também é sincronizado. Isso remove
  // comandos legados que continuariam aparecendo mesmo após atualizar apenas a guild.
  if (selected === 'auto' && env.guildId) {
    const globalRoute = Routes.applicationCommands(env.clientId);
    const existing = await rest.get(globalRoute);
    if (Array.isArray(existing) && existing.length)
      results.push(
        await sync(rest, globalRoute, commandPayload(commandList, true), 'global:existing'),
      );
  }
  return results;
}

export function commandCatalog(commandList) {
  return {
    commands: commandList.length,
    actions: commandList.reduce(
      (count, command) =>
        count + (command.data.options?.filter((option) => option.type === 1).length || 1),
      0,
    ),
    catalog: commandList.map((command) => ({
      name: command.name,
      module: command.module,
      subcommands:
        command.data.options?.filter((option) => option.type === 1).map((option) => option.name) ??
        [],
    })),
  };
}
