import { embed, row, button, reply, safe } from '../core/ui.js';
export function suggestionView(config, s) {
  const up = Object.values(s.votes).filter((v) => v === 1).length,
    down = Object.values(s.votes).filter((v) => v === -1).length;
  return {
    embeds: [
      embed(
        config,
        `💡 SUGESTÃO / ${s.id}`,
        `${safe(s.text)}\n\nPor <@${s.author}>\n\n👍 **${up}** · 👎 **${down}**`,
      ),
    ],
    components: [
      row(
        button(`suggest:${s.id}:up`, 'Apoiar'),
        button(`suggest:${s.id}:down`, 'Discordar'),
        button(`suggest:${s.id}:remove`, 'Retirar voto'),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}
const busy = new Set();
export async function suggestionComponent(i, ctx) {
  const [, id, action] = i.customId.split(':'),
    s = ctx.store.get('suggestions', id);
  if (!s || s.guild !== i.guildId || s.message !== i.message.id)
    throw new Error('Sugestão não encontrada.');
  if (busy.has(id)) return reply(i, 'Outro voto está sendo salvo. Tente novamente em instantes.');
  busy.add(id);
  try {
    if (action === 'remove') delete s.votes[i.user.id];
    else s.votes[i.user.id] = action === 'up' ? 1 : -1;
    ctx.store.set('suggestions', id, s);
    await i.update(suggestionView(ctx.store.config(i.guildId), s));
  } finally {
    busy.delete(id);
  }
}
