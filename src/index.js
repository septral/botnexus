import { Client, Events, GatewayIntentBits, Partials, ActivityType, RESTEvents } from 'discord.js';
import { createServer } from 'node:http';
import { Store } from './core/store.js';
import { environment } from './core/environment.js';
import { processLock } from './core/lock.js';
import { log } from './core/log.js';
import { makeRouter } from './core/router.js';
import { commandList, commands } from './commands/index.js';
import { deployCommands } from './core/deploy.js';
import { startTerminal } from './core/terminal.js';
import { GiveawayService } from './features/giveaways.js';
import { Scheduler } from './features/scheduler.js';
import { bindEvents } from './features/events.js';
import { restoreBotVoiceConnections } from './features/bot-voice.js';
let release, store, client, scheduler, health, terminal, deployTimer;
let stopping = false;
let deploying = false;
async function shutdown(code = 0, reason = 'shutdown') {
  if (stopping) return;
  stopping = true;
  log('info', 'shutdown_started', { code, reason });
  const forced = setTimeout(() => process.exit(code || 1), 15000);
  forced.unref();
  try {
    clearTimeout(deployTimer);
    await scheduler?.stop();
    terminal?.stop();
    health?.close();
    client?.destroy();
    store?.close();
    release?.();
  } catch (error) {
    log('error', 'shutdown_failed', { error: error.message, stack: error.stack });
    code ||= 1;
  } finally {
    clearTimeout(forced);
    process.exit(code);
  }
}

const fatal = (event, value, origin) => {
  const error = value instanceof Error ? value : new Error(String(value));
  log('error', event, { error: error.message, origin, stack: error.stack });
  void shutdown(1, event);
};

process.on('SIGINT', () => void shutdown(0, 'SIGINT'));
process.on('SIGTERM', () => void shutdown(0, 'SIGTERM'));
process.on('SIGHUP', () => void shutdown(0, 'SIGHUP'));
process.on('uncaughtException', (error, origin) => fatal('uncaught_exception', error, origin));
process.on('unhandledRejection', (reason) => fatal('unhandled_rejection', reason));
process.on('warning', (warning) =>
  log('warn', 'process_warning', {
    name: warning.name,
    warning: warning.message,
    stack: warning.stack,
  }),
);
for (const stream of [process.stdout, process.stderr])
  stream.on('error', (error) => {
    if (error.code !== 'EPIPE')
      fatal('process_stream_error', error, stream === process.stdout ? 'stdout' : 'stderr');
  });

try {
  const env = environment();
  log('info', 'startup', {
    pid: process.pid,
    node: process.version,
    database: env.database,
    autoDeploy: env.autoDeploy,
    deployScope: env.deployScope,
  });
  release = processLock(env.database);
  store = new Store(env.database);
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    ...(env.members ? [GatewayIntentBits.GuildMembers] : []),
    ...(env.messageContent ? [GatewayIntentBits.MessageContent] : []),
    ...(env.presences ? [GatewayIntentBits.GuildPresences] : []),
  ];
  client = new Client({
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
    allowedMentions: { parse: [], repliedUser: false },
    rest: { timeout: 15000, retries: 3 },
    presence: {
      activities: [{ name: '/ajuda • Sanatório NEXUS', type: ActivityType.Watching }],
      status: 'online',
    },
  });
  const ctx = { client, store, commands };
  ctx.giveaways = new GiveawayService(ctx);
  scheduler = new Scheduler(ctx);
  ctx.scheduler = scheduler;
  const syncCommands = async (reason = 'manual', retry = false) => {
    if (deploying) {
      log('warn', 'commands_deploy_skipped', { reason: 'deploy já em andamento' });
      return [];
    }
    deploying = true;
    try {
      const result = await deployCommands(env, commandList, { scope: env.deployScope });
      clearTimeout(deployTimer);
      deployTimer = undefined;
      return result;
    } catch (error) {
      log('error', 'commands_deploy_failed', { reason, error: error.message, stack: error.stack });
      if (retry && !stopping) {
        clearTimeout(deployTimer);
        deployTimer = setTimeout(() => void syncCommands('retry', true), 5 * 60000);
        deployTimer.unref();
        log('warn', 'commands_deploy_retry_scheduled', { minutes: 5 });
      }
      if (!retry) throw error;
      return [];
    } finally {
      deploying = false;
    }
  };
  terminal = startTerminal({ ctx, env, deploy: () => syncCommands('terminal'), shutdown });
  client.on(Events.InteractionCreate, makeRouter(ctx));
  bindEvents(ctx);
  client.once(Events.ClientReady, (ready) => {
    log('info', 'ready', {
      bot: ready.user.tag,
      commands: commands.size,
      guilds: ready.guilds.cache.size,
    });
    scheduler.start();
    void restoreBotVoiceConnections(ctx);
  });
  client.on(Events.Error, (e) => log('error', 'discord_client', { error: e.message }));
  client.on(Events.ShardError, (e) => log('error', 'discord_shard', { error: e.message }));
  client.on(Events.Warn, (message) => log('warn', 'discord_warning', { message }));
  client.on(Events.Debug, (message) => log('debug', 'discord_debug', { message }));
  client.on(Events.ShardReady, (id) => log('info', 'discord_shard_ready', { shard: id }));
  client.on(Events.ShardReconnecting, (id) =>
    log('warn', 'discord_shard_reconnecting', { shard: id }),
  );
  client.on(Events.ShardResume, (id, replayed) =>
    log('info', 'discord_shard_resumed', { shard: id, replayed }),
  );
  client.on(Events.ShardDisconnect, (event, id) =>
    log('warn', 'discord_shard_disconnected', { shard: id, code: event.code }),
  );
  client.on(Events.Invalidated, () => void shutdown(1, 'discord_session_invalidated'));
  client.on(Events.GuildCreate, (guild) =>
    log('info', 'discord_guild_added', { guild: guild.id, name: guild.name }),
  );
  client.on(Events.GuildDelete, (guild) =>
    log('warn', 'discord_guild_removed', { guild: guild.id, name: guild.name }),
  );
  client.rest.on(RESTEvents.RateLimited, (data) =>
    log('warn', 'discord_rate_limited', {
      route: data.route,
      global: data.global,
      timeToReset: data.timeToReset,
    }),
  );
  client.rest.on(RESTEvents.InvalidRequestWarning, (data) =>
    log('warn', 'discord_invalid_request_warning', data),
  );
  if (env.port) {
    health = createServer((_req, res) => {
      res.writeHead(client.isReady() ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ready: client.isReady(), uptime: Math.floor(process.uptime()) }));
    });
    health.on('error', (e) => {
      log('error', 'health_server', { error: e.message });
      shutdown(1);
    });
    health.listen(env.port, '127.0.0.1', () =>
      log('info', 'health_server_ready', { address: '127.0.0.1', port: env.port }),
    );
  }
  if (env.autoDeploy) await syncCommands('startup', true);
  else log('warn', 'commands_auto_deploy_disabled');
  await client.login(env.token);
} catch (e) {
  log('error', 'startup_failed', {
    error:
      e.code === 4014
        ? 'Ative Server Members Intent e Message Content Intent no Developer Portal, ou desative-os no .env.'
        : e.message,
  });
  await shutdown(1, 'startup_failed');
}
