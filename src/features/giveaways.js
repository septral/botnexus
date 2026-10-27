import { randomInt } from 'node:crypto';
import { embed, row, button, safe, reply, time } from '../core/ui.js';
import { log } from '../core/log.js';
export function draw(participants, count, exclude = []) {
  const pool = [...new Set(participants)].filter((v) => !exclude.includes(v));
  const winners = [];
  while (pool.length && winners.length < count)
    winners.push(pool.splice(randomInt(pool.length), 1)[0]);
  return winners;
}
export function giveawayView(config, g) {
  return {
    embeds: [
      embed(
        config,
        `🎉 SORTEIO / ${safe(g.prize)}`,
        `**Vencedores:** ${g.count}\n**Encerra:** ${time(g.endsAt)}\n**Participantes:** ${g.participants.length}\n**Estado:** ${g.state === 'active' ? 'Aberto' : 'Encerrado'}\n**ID:** \`${g.id}\``,
      ),
    ],
    components:
      g.state === 'active' ? [row(button(`giveaway:${g.id}:join`, 'Participar / sair'))] : [],
    allowedMentions: { parse: [] },
  };
}
export async function giveawayComponent(i, ctx) {
  const id = i.customId.split(':')[1],
    g = ctx.store.get('giveaways', id);
  if (!g || g.guild !== i.guildId || g.message !== i.message.id)
    throw new Error('Sorteio não encontrado.');
  if (g.state !== 'active' || g.endsAt <= Date.now()) throw new Error('O sorteio já encerrou.');
  const member = i.member;
  if (member.user.bot) throw new Error('Bots não participam.');
  const latest = ctx.store.get('giveaways', id);
  if (latest.state !== 'active') throw new Error('Sorteio encerrado.');
  const entered = latest.participants.includes(i.user.id);
  latest.participants = entered
    ? latest.participants.filter((v) => v !== i.user.id)
    : [...latest.participants, i.user.id];
  ctx.store.set('giveaways', id, latest);
  await reply(
    i,
    entered
      ? 'Sua participação foi retirada.'
      : '✅ Participação registrada. Você pode clicar novamente para sair.',
  );
  // O contador é atualizado no ciclo periódico; não há uma edição a cada clique.
}
export class GiveawayService {
  constructor(ctx) {
    this.ctx = ctx;
    this.busy = new Set();
  }
  async finish(id, { reroll = false } = {}) {
    if (this.busy.has(id)) throw new Error('Sorteio já está sendo processado.');
    this.busy.add(id);
    try {
      let g = this.ctx.store.get('giveaways', id);
      if (!g) throw new Error('Sorteio não encontrado.');
      if (!reroll && !['active', 'closing'].includes(g.state)) return g;
      if (reroll && g.state !== 'finished')
        throw new Error('Encerre o sorteio antes de sortear novamente.');
      const pool = g.participants;
      if (g.state !== 'closing')
        g = {
          ...g,
          winners: draw(pool, g.count, reroll ? (g.winners ?? []) : []),
          round: (g.round ?? 0) + 1,
          state: 'closing',
        };
      this.ctx.store.set('giveaways', id, g);
      const channel = await this.ctx.client.channels.fetch(g.channel);
      const msg = await channel.messages.fetch(g.message).catch((e) => {
        if (e.code === 10008) return null;
        throw e;
      });
      if (msg) await msg.edit(giveawayView(this.ctx.store.config(g.guild), g));
      const key = `giveaway:${id}:${g.round}`;
      if (this.ctx.store.claimEvent(key, channel.id)) {
        try {
          const m = await channel.send({
            content: g.winners.length
              ? `🎉 ${g.winners.map((v) => `<@${v}>`).join(', ')} ganharam **${safe(g.prize)}**!`
              : `🎉 Sorteio de **${safe(g.prize)}** encerrado sem participantes elegíveis.`,
            allowedMentions: { users: g.winners, parse: [] },
            nonce: `${id.slice(-16)}${g.round}`,
            enforceNonce: true,
          });
          this.ctx.store.finishEvent(key, m.id);
        } catch (e) {
          this.ctx.store.uncertainEvent(key);
          g.deliveryError = 'Entrega incerta; confira o canal antes de usar rerolar.';
        }
      }
      g.state = 'finished';
      this.ctx.store.set('giveaways', id, g);
      return g;
    } finally {
      this.busy.delete(id);
    }
  }
  async tick() {
    for (const g of this.ctx.store
      .list('giveaways')
      .filter((g) => ['active', 'closing'].includes(g.state) && !(g.retryAt > Date.now()))) {
      try {
        if (g.endsAt <= Date.now() || g.state === 'closing') await this.finish(g.id);
        else if (Date.now() - (g.renderedAt ?? 0) > 60000) {
          const channel = await this.ctx.client.channels.fetch(g.channel);
          const msg = await channel.messages.fetch(g.message);
          await msg.edit(giveawayView(this.ctx.store.config(g.guild), g));
          const latest = this.ctx.store.get('giveaways', g.id);
          if (latest?.state === 'active')
            this.ctx.store.set('giveaways', g.id, { ...latest, renderedAt: Date.now() });
        }
      } catch (e) {
        const latest = this.ctx.store.get('giveaways', g.id);
        if (latest)
          this.ctx.store.set('giveaways', g.id, { ...latest, retryAt: Date.now() + 60000 });
        log('error', 'giveaway_failed', { id: g.id, error: e.message });
      }
    }
  }
}
