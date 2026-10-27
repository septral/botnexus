import test from 'node:test';
import assert from 'node:assert/strict';
import { log, setLogWriter } from '../src/core/log.js';

test('logger remove tokens e campos sensíveis antes de entregar ao terminal', (t) => {
  const oldDiscord = process.env.DISCORD_TOKEN;
  const oldGroq = process.env.GROQ_API_KEY;
  const oldGemini = process.env.GEMINI_API_KEY;
  process.env.DISCORD_TOKEN = 'discord-secret-test';
  process.env.GROQ_API_KEY = 'groq-secret-test';
  process.env.GEMINI_API_KEY = 'gemini-secret-test';
  let record;
  setLogWriter((value) => {
    record = value;
  });
  t.after(() => {
    setLogWriter(null);
    if (oldDiscord === undefined) delete process.env.DISCORD_TOKEN;
    else process.env.DISCORD_TOKEN = oldDiscord;
    if (oldGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = oldGroq;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGemini;
  });
  log('info', 'redaction_test', {
    token: 'valor qualquer',
    text: 'discord-secret-test, groq-secret-test e gemini-secret-test',
  });
  assert.equal(record.token, '[REDACTED]');
  assert.equal(record.text, '[REDACTED], [REDACTED] e [REDACTED]');
});
