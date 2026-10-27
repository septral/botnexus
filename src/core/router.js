import { MessageFlags } from 'discord.js';
import { requireUser } from './permissions.js';
import { configComponent } from '../features/config-panel.js';
import { ticketComponent, ticketRatingDmComponent } from '../features/tickets.js';
import { verificationComponent } from '../features/verification.js';
import { tempCallComponent } from '../features/tempcalls.js';
import { nexusComponent, nexusInviteDmComponent, vipComponent } from '../features/vip.js';
import { roleComponent } from '../features/role-panels.js';
import { shopComponent } from '../features/shop.js';
import { economyPanelComponent } from '../features/economy-panels.js';
import { suggestionComponent } from '../features/suggestions.js';
import { giveawayComponent } from '../features/giveaways.js';
import { embedComponent, rulesComponent } from '../commands/community.js';
import { helpView } from '../commands/utilities.js';
import { log } from './log.js';
import { defer } from './ui.js';
const modulePrefixes = {
  ticket: 'tickets',
  verify: 'verification',
  tempcall: 'tempcalls',
  vip: 'economy',
  nexus: 'economy',
  shop: 'economy',
  scratch: 'economy',
  work: 'economy',
  rolepanel: 'community',
  suggest: 'community',
  giveaway: 'community',
  draft: 'community',
  rules: 'community',
};
const sourceCommands = {
  cfg: 'botconfig',
  ticket: 'ticket',
  verify: 'verificar',
  tempcall: 'tempcall',
  vip: 'vip',
  nexus: 'criarvipnx',
  rolepanel: 'rolepanel',
  suggest: 'sugerir',
  giveaway: 'sorteio',
  draft: 'embed',
  rules: 'regras',
  help: 'ajuda',
};
export function makeRouter(ctx) {
  const cooldowns = new Map();
  const sweep = setInterval(() => {
    for (const [k, t] of cooldowns) if (Date.now() - t > 60000) cooldowns.delete(k);
  }, 60000);
  sweep.unref();
  return async (i) => {
    if (!i.isChatInputCommand() && !i.isMessageComponent() && !i.isModalSubmit()) return;
    const started = Date.now();
    let failed = false;
    try {
      const earlyPrefix = i.customId?.split(':')[0];
      if (earlyPrefix === 'ticketrate') return await ticketRatingDmComponent(i, ctx);
      if (earlyPrefix === 'nexusinvite') return await nexusInviteDmComponent(i, ctx);
      if (!i.inCachedGuild())
        throw new Error('Use o bot em um servidor onde ele esteja instalado.');
      const c = ctx.store.config(i.guildId),
        prefix = i.customId?.split(':')[0];
      const cmd = i.isChatInputCommand() ? ctx.commands.get(i.commandName) : null;
      if (i.isChatInputCommand() && !cmd)
        throw new Error('Comando indisponível. Atualize os comandos com npm run deploy.');
      const module = cmd?.module ?? modulePrefixes[prefix];
      if (module && module !== 'config' && !c.modules[module])
        throw new Error('Este módulo está desativado. A equipe pode ativá-lo em /botconfig.');
      if (
        cmd &&
        cmd.module !== 'config' &&
        c.access.disabledCommands
          .split('\n')
          .map((v) => v.trim())
          .includes(cmd.name)
      )
        throw new Error('Este comando foi desativado pela equipe.');
      if (cmd?.permission) requireUser(i, cmd.permission);
      const visibilityCommand = cmd?.name ?? sourceCommands[prefix];
      if (visibilityCommand)
        i.nexusEphemeral = !c.access.publicCommands
          .split('\n')
          .map((v) => v.trim())
          .filter(Boolean)
          .includes(visibilityCommand);
      // CAPTCHAs, transcripts e controles operacionais nunca devem vazar por uma
      // preferência global de resposta pública.
      if (
        ['ticket', 'tempcall', 'verificar', 'vip', 'criarvipnx', 'setarloja'].includes(cmd?.name) ||
        ['ticket', 'tempcall', 'verify', 'vip', 'nexus'].includes(prefix)
      )
        i.nexusEphemeral = true;
      const key = `${i.guildId}:${i.user.id}:${cmd?.name ?? prefix}`;
      const last = cooldowns.get(key) ?? 0;
      if (Date.now() - last < (cmd ? c.access.cooldownSeconds * 1000 : 1000))
        throw new Error('Aguarde um instante antes de repetir esta ação.');
      cooldowns.set(key, Date.now());
      if (cmd) {
        if (!['botconfig', 'embed', 'verificar'].includes(cmd.name)) await defer(i);
        return await cmd.run(i, ctx);
      }
      if (prefix === 'cfg') return await configComponent(i, ctx);
      if (prefix === 'ticket') return await ticketComponent(i, ctx);
      if (prefix === 'verify') return await verificationComponent(i, ctx);
      if (prefix === 'tempcall') return await tempCallComponent(i, ctx);
      if (prefix === 'vip') return await vipComponent(i, ctx);
      if (prefix === 'nexus') return await nexusComponent(i, ctx);
      if (prefix === 'shop') return await shopComponent(i, ctx);
      if (prefix === 'scratch' || prefix === 'work') return await economyPanelComponent(i, ctx);
      if (prefix === 'rolepanel') return await roleComponent(i, ctx);
      if (prefix === 'suggest') return await suggestionComponent(i, ctx);
      if (prefix === 'giveaway') return await giveawayComponent(i, ctx);
      if (prefix === 'draft') return await embedComponent(i, ctx);
      if (prefix === 'rules') return await rulesComponent(i, ctx);
      if (prefix === 'help') {
        if (i.customId.split(':')[1] !== i.user.id)
          throw new Error('Abra sua própria ajuda com /ajuda.');
        return await i.update(helpView(i, ctx, i.values[0]));
      }
      throw new Error('Este controle não está mais disponível.');
    } catch (e) {
      failed = true;
      log('warn', 'interaction_failed', {
        guild: i.guildId,
        command: i.commandName ?? i.customId,
        error: e.message,
        code: e.code,
      });
      const content = `⚠️ ${String(e.message).slice(0, 1700)}`;
      try {
        if (i.deferred && !i.replied && i.ephemeral !== null)
          await i.editReply({
            content,
            embeds: [],
            components: [],
            allowedMentions: { parse: [] },
          });
        else if (i.deferred || i.replied)
          await i.followUp({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          });
        else if (i.inGuild())
          await i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        else await i.reply({ content, allowedMentions: { parse: [] } });
      } catch (replyError) {
        log('error', 'interaction_reply_failed', { error: replyError.message });
      }
    } finally {
      log('info', 'interaction_completed', {
        guild: i.guildId,
        user: i.user?.id,
        interaction: i.commandName ?? i.customId,
        type: i.isChatInputCommand() ? 'command' : i.isModalSubmit() ? 'modal' : 'component',
        success: !failed,
        durationMs: Date.now() - started,
      });
    }
  };
}
