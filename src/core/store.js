import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG, validateConfig } from './config.js';

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS configs(guild TEXT PRIMARY KEY,json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS records(namespace TEXT NOT NULL,key TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(namespace,key));
      CREATE TABLE IF NOT EXISTS cases(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,target TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS cases_target ON cases(guild,target,created);
      CREATE TABLE IF NOT EXISTS accounts(guild TEXT NOT NULL,user TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),bank INTEGER NOT NULL DEFAULT 0 CHECK(bank>=0),xp INTEGER NOT NULL DEFAULT 0,last_xp INTEGER NOT NULL DEFAULT 0,last_daily INTEGER NOT NULL DEFAULT 0,last_work INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user));
      CREATE TABLE IF NOT EXISTS events(key TEXT PRIMARY KEY,state TEXT NOT NULL,channel TEXT NOT NULL,message TEXT,created INTEGER NOT NULL);
      PRAGMA user_version=1;`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  config(guild) {
    const row = this.db.prepare('SELECT * FROM configs WHERE guild=?').get(guild);
    return row
      ? { ...validateConfig(JSON.parse(row.json)), revision: row.revision }
      : { ...structuredClone(DEFAULT_CONFIG), revision: 0 };
  }
  saveConfig(guild, input) {
    const config = validateConfig(input);
    this.db
      .prepare(
        'INSERT INTO configs(guild,json) VALUES (?,?) ON CONFLICT(guild) DO UPDATE SET json=excluded.json,revision=configs.revision+1',
      )
      .run(guild, JSON.stringify(config));
    return this.config(guild);
  }
  allConfigs() {
    return this.db
      .prepare('SELECT guild FROM configs')
      .all()
      .map((r) => ({ guild: r.guild, config: this.config(r.guild) }));
  }
  get(ns, key) {
    const r = this.db
      .prepare('SELECT json FROM records WHERE namespace=? AND key=?')
      .get(ns, String(key));
    return r ? JSON.parse(r.json) : null;
  }
  set(ns, key, value) {
    this.db
      .prepare(
        'INSERT INTO records VALUES (?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET json=excluded.json',
      )
      .run(ns, String(key), JSON.stringify(value));
    return value;
  }
  delete(ns, key) {
    return (
      this.db.prepare('DELETE FROM records WHERE namespace=? AND key=?').run(ns, String(key))
        .changes > 0
    );
  }
  list(ns) {
    return this.db
      .prepare('SELECT key,json FROM records WHERE namespace=?')
      .all(ns)
      .map((r) => ({ key: r.key, ...JSON.parse(r.json) }));
  }
  addCase(guild, target, actor, action, reason) {
    return Number(
      this.db
        .prepare('INSERT INTO cases(guild,target,actor,action,reason,created) VALUES (?,?,?,?,?,?)')
        .run(guild, target, actor, action, reason, Date.now()).lastInsertRowid,
    );
  }
  cases(guild, target = null) {
    return target
      ? this.db
          .prepare('SELECT * FROM cases WHERE guild=? AND target=? ORDER BY id DESC LIMIT 100')
          .all(guild, target)
      : this.db.prepare('SELECT * FROM cases WHERE guild=? ORDER BY id DESC LIMIT 100').all(guild);
  }
  account(guild, user) {
    this.db.prepare('INSERT OR IGNORE INTO accounts(guild,user) VALUES (?,?)').run(guild, user);
    return this.db.prepare('SELECT * FROM accounts WHERE guild=? AND user=?').get(guild, user);
  }
  changeAccount(guild, user, fields) {
    this.account(guild, user);
    const allowed = ['balance', 'bank', 'xp', 'last_xp', 'last_daily', 'last_work'];
    for (const [key, value] of Object.entries(fields)) {
      if (
        !allowed.includes(key) ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > Number.MAX_SAFE_INTEGER / 2
      )
        throw new Error('Valor financeiro/XP inválido.');
      this.db
        .prepare(`UPDATE accounts SET ${key}=? WHERE guild=? AND user=?`)
        .run(value, guild, user);
    }
    return this.account(guild, user);
  }
  transfer(guild, from, to, amount) {
    if (from === to) throw new Error('Escolha outro usuário.');
    return this.transaction(() => {
      const a = this.account(guild, from),
        b = this.account(guild, to);
      if (!Number.isSafeInteger(amount) || amount < 1 || a.balance < amount)
        throw new Error('Saldo insuficiente ou valor inválido.');
      this.changeAccount(guild, from, { balance: a.balance - amount });
      this.changeAccount(guild, to, { balance: b.balance + amount });
    });
  }
  leaderboard(guild, field = 'xp') {
    if (!['xp', 'balance', 'bank'].includes(field)) throw new Error('Ranking inválido.');
    return this.db
      .prepare(`SELECT * FROM accounts WHERE guild=? ORDER BY ${field} DESC LIMIT 10`)
      .all(guild);
  }
  claimEvent(key, channel) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO events(key,state,channel,created) VALUES (?,'sending',?,?)")
        .run(key, channel, Date.now()).changes === 1
    );
  }
  finishEvent(key, message) {
    this.db.prepare("UPDATE events SET state='sent',message=? WHERE key=?").run(message, key);
  }
  uncertainEvent(key) {
    this.db.prepare("UPDATE events SET state='uncertain' WHERE key=?").run(key);
  }
  events(prefix) {
    return this.db.prepare('SELECT * FROM events WHERE key LIKE ?').all(prefix + '%');
  }
  close() {
    this.db.close();
  }
}
