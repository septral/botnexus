import { createInterface } from 'node:readline';
import { formatLogRecord, log, setLogWriter } from './log.js';

const line = '─'.repeat(72);
const memory = () => {
  const usage = process.memoryUsage();
  return {
    rssMB: Math.round(usage.rss / 1024 / 1024),
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
  };
};

export function startTerminal({ ctx, env, deploy, shutdown }) {
  if (!env.interactiveConsole || !process.stdin.isTTY || !process.stdout.isTTY) {
    log('info', 'terminal_non_interactive', {
      reason: 'stdin/stdout sem TTY',
      logs: 'JSON em tempo real',
    });
    return { stop() {} };
  }

  const output = process.stdout;
  const recent = [];
  let closed = false;
  const rl = createInterface({ input: process.stdin, output, terminal: true, historySize: 50 });
  rl.setPrompt('\x1b[35mnexus>\x1b[0m ');

  const write = (text = '') => {
    if (closed) return;
    output.write(`\r\x1b[2K${text}\n`);
  };
  const header = () => {
    write('\x1b[95m╭─ SANATÓRIO NEXUS / CONSOLE OPERACIONAL\x1b[0m');
    write(`│ PID ${process.pid}  •  Node ${process.version}  •  ${ctx.commands.size} comandos`);
    write(`│ Auto-deploy ${env.autoDeploy ? 'ativo' : 'desativado'}  •  escopo ${env.deployScope}`);
    write(`╰${line}`);
  };
  const clear = (replay = true) => {
    output.write('\x1b[2J\x1b[H');
    header();
    if (replay && recent.length) {
      write('Últimos eventos:');
      for (const record of recent.slice(-12)) write(formatLogRecord(record, true));
      write(line);
    }
  };
  const prompt = () => {
    if (!closed) rl.prompt(true);
  };

  setLogWriter((record) => {
    recent.push(record);
    if (recent.length > 100) recent.shift();
    write(formatLogRecord(record, true));
    prompt();
  });

  clear(false);
  write('Digite help para ver os comandos do terminal.');
  prompt();

  const execute = async (raw) => {
    const [command] = raw.trim().toLowerCase().split(/\s+/);
    if (!command) return;
    if (command === 'help') {
      write('help      mostra esta ajuda');
      write('status    conexão, uptime, ping, memória e tarefas');
      write('guilds    lista os servidores conectados');
      write('commands  lista os slash commands carregados');
      write('deploy    sincroniza agora os comandos com o Discord');
      write('clear     limpa o terminal preservando os últimos eventos');
      write('stop      encerra o processo com segurança');
      write('restart   encerra com código 75 para a hospedagem reiniciar');
      return;
    }
    if (command === 'status') {
      log('info', 'terminal_status', {
        ready: ctx.client.isReady(),
        bot: ctx.client.user?.tag ?? 'conectando',
        gatewayPing: ctx.client.ws.ping,
        guilds: ctx.client.guilds.cache.size,
        uptimeSeconds: Math.floor(process.uptime()),
        schedulerRunning: Boolean(ctx.scheduler?.running),
        memory: memory(),
      });
      return;
    }
    if (command === 'guilds') {
      const guilds = ctx.client.guilds.cache
        .map((guild) => `${guild.name} (${guild.id})`)
        .join(' | ');
      write(guilds || 'Nenhum servidor conectado.');
      return;
    }
    if (command === 'commands') {
      write(
        [...ctx.commands.keys()]
          .sort()
          .map((name) => `/${name}`)
          .join('  '),
      );
      return;
    }
    if (command === 'deploy') {
      log('info', 'terminal_deploy_requested');
      await deploy();
      return;
    }
    if (command === 'clear') {
      clear();
      return;
    }
    if (command === 'stop') return shutdown(0, 'terminal');
    if (command === 'restart') return shutdown(75, 'terminal_restart');
    write(`Comando desconhecido: ${command}. Digite help.`);
  };

  rl.on('line', (input) => {
    Promise.resolve(execute(input))
      .catch((error) =>
        log('error', 'terminal_command_failed', { command: input, error: error.message }),
      )
      .finally(prompt);
  });
  rl.on('SIGINT', () => void shutdown(0, 'terminal_sigint'));
  rl.on('close', () => {
    closed = true;
  });

  const clearTimer = env.consoleClearMinutes
    ? setInterval(() => clear(), env.consoleClearMinutes * 60000)
    : null;
  clearTimer?.unref();

  return {
    stop() {
      if (closed) return;
      closed = true;
      if (clearTimer) clearInterval(clearTimer);
      setLogWriter(null);
      rl.close();
    },
  };
}
