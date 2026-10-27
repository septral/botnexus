import { commandList } from '../src/commands/index.js';
import { environment } from '../src/core/environment.js';
import { commandCatalog, deployCommands } from '../src/core/deploy.js';

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify(commandCatalog(commandList), null, 2));
} else {
  try {
    const env = environment();
    const scope = process.argv.includes('--global')
      ? 'global'
      : process.argv.includes('--both')
        ? 'both'
        : 'guild';
    const results = await deployCommands(env, commandList, { scope });
    for (const result of results)
      console.log(
        `${result.commands} comandos sincronizados em ${result.scope}; ${result.added.length} novos e ${result.removed.length} removidos.`,
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
