import utilities from './utilities.js';
import moderation from './moderation.js';
import community from './community.js';
import economy from './economy.js';
import adminTools from './admin-tools.js';
export const commandList = [
  ...utilities,
  ...moderation,
  ...community,
  ...economy,
  ...adminTools,
];
export const commands = new Map(commandList.map((c) => [c.name, c]));
if (commands.size !== commandList.length) throw new Error('Comando duplicado no registro.');
