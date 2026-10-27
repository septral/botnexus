import { openSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function processLock(database) {
  const path = resolve(database) + '.lock';
  mkdirSync(dirname(path), { recursive: true });
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let previous;
    try {
      previous = Number(readFileSync(path, 'utf8'));
    } catch {
      throw new Error('O lock do banco não pode ser lido. Verifique a pasta data.');
    }
    if (!Number.isSafeInteger(previous) || previous < 1)
      throw new Error('Lock inválido. Com o bot parado, remova o arquivo .lock da pasta data.');
    try {
      process.kill(previous, 0);
      throw new Error('Já existe um processo usando este banco. Pare a outra instância do bot.');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    unlinkSync(path);
    fd = openSync(path, 'wx');
  }
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  return () => {
    try {
      if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path);
    } catch {}
  };
}
