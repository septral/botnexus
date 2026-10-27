import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { commandList } from '../src/commands/index.js';
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}
const all = ['src', 'scripts', 'test'].flatMap((dir) => files(dir));
for (const file of all) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
}
if (commandList.length > 100) throw new Error('Limite de 100 comandos slash ultrapassado.');
function checkOption(o) {
  if (o.name.length > 32 || !/^[-_\p{Ll}\p{Lo}\p{N}]+$/u.test(o.name))
    throw new Error(`Nome de opção inválido: ${o.name}`);
  if (!o.description || o.description.length > 100) throw new Error('Descrição de opção inválida.');
  if (o.choices?.length > 25) throw new Error('Muitas escolhas.');
  if (o.options) {
    let optional = false;
    for (const child of o.options) {
      if (child.type !== 1 && child.type !== 2) {
        if (!child.required) optional = true;
        else if (optional) throw new Error(`Obrigatória após opcional: ${o.name}/${child.name}`);
      }
      checkOption(child);
    }
  }
}
for (const c of commandList) {
  if (!c.run || !c.module) throw new Error('Comando sem implementação ou módulo.');
  checkOption({ ...c.data, options: c.data.options ?? [] });
}
console.log(`${all.length} arquivos JavaScript e ${commandList.length} comandos verificados.`);
