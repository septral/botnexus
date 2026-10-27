import { log } from '../core/log.js';
import { ticketAutomationTick } from './tickets.js';
import { tempCallSweep } from './tempcalls.js';
import { vipSweep } from './vip.js';
export class Scheduler {
  constructor(ctx) {
    this.ctx = ctx;
    this.running = false;
    this.stopping = false;
    this.lastOperationsTick = 0;
    this.lastVipTick = 0;
  }
  async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      for (const r of this.ctx.store
        .list('reminders')
        .filter((r) => r.status === 'pending' && r.due <= Date.now())) {
        // Marcar antes da DM impede repetição depois de queda durante a entrega.
        r.status = 'sending';
        this.ctx.store.set('reminders', r.id, r);
        try {
          const user = await this.ctx.client.users.fetch(r.user);
          await user.send({
            content: `⏰ **Seu lembrete**\n${r.text}`,
            allowedMentions: { parse: [] },
            nonce: r.id,
            enforceNonce: true,
          });
          r.status = 'sent';
        } catch (e) {
          r.status = 'failed';
          r.error = String(e.code ?? e.message);
          log('warn', 'reminder_failed', { id: r.id, error: r.error });
        }
        this.ctx.store.set('reminders', r.id, r);
      }
      await this.ctx.giveaways.tick();
      if (Date.now() - this.lastOperationsTick >= 30000) {
        this.lastOperationsTick = Date.now();
        await ticketAutomationTick(this.ctx);
        await tempCallSweep(this.ctx);
      }
      if (Date.now() - this.lastVipTick >= 3600000) {
        this.lastVipTick = Date.now();
        await vipSweep(this.ctx);
      }
    } catch (e) {
      log('error', 'scheduler_failed', { error: e.message });
    } finally {
      this.running = false;
    }
  }
  start() {
    this.timer = setInterval(() => this.tick(), 5000);
    this.tick();
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    const deadline = Date.now() + 12000;
    while (this.running && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  }
}
