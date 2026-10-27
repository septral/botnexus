import { accessSync, constants, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { commandList } from '../src/commands/index.js';
import { environment } from '../src/core/environment.js';
try {
  const env = environment({ requireToken: false }),
    version = process.versions.node.split('.').map(Number);
  if (version[0] < 24 || (version[0] === 24 && version[1] < 17))
    throw new Error('Use Node 24.17.0 ou superior.');
  console.log(`✓ Node ${process.version}; ${commandList.length} comandos carregados.`);
  console.log(
    `${env.token ? '✓' : '!'} Token ${env.token ? 'definido' : 'não definido'} (não é exibido).`,
  );
  console.log(
    `${/^\d{17,20}$/.test(env.clientId) ? '✓' : '!'} Application ID ${/^\d{17,20}$/.test(env.clientId) ? 'definido' : 'não definido ou inválido'}.`,
  );
  console.log(
    `${env.guildId ? '✓' : '!'} Servidor para registro ${env.guildId ? 'definido' : 'não definido'}.`,
  );
  mkdirSync(dirname(env.database), { recursive: true });
  accessSync(dirname(env.database), constants.W_OK);
  console.log('✓ Diretório de dados gravável.');
  const intents = [
    env.members && 'Server Members Intent',
    env.messageContent && 'Message Content Intent',
    env.presences && 'Presence Intent',
  ].filter(Boolean);
  console.log(`! Ative no Developer Portal: ${intents.join('; ') || 'nenhuma intent privilegiada solicitada'}.`);
  console.log(
    `${env.autoDeploy ? '✓' : '!'} Deploy automático ${env.autoDeploy ? `ativo no escopo ${env.deployScope}` : 'desativado'}.`,
  );
  console.log(
    `${env.interactiveConsole ? '✓' : '!'} Console interativo ${env.interactiveConsole ? `ativo; limpeza a cada ${env.consoleClearMinutes || '∞'} minuto(s) quando houver TTY` : 'desativado'}.`,
  );
} catch (e) {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
}
