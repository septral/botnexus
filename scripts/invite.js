import { PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { environment } from '../src/core/environment.js';
const env = environment({ requireToken: false });
if (!/^\d{17,20}$/.test(env.clientId)) {
  console.error('Preencha DISCORD_CLIENT_ID no .env.');
  process.exitCode = 1;
} else {
  const permissions = new PermissionsBitField([
    P.ViewChannel,
    P.SendMessages,
    P.EmbedLinks,
    P.AttachFiles,
    P.ReadMessageHistory,
    P.ManageChannels,
    P.ManageRoles,
    P.ManageMessages,
    P.ModerateMembers,
    P.KickMembers,
    P.BanMembers,
    P.MuteMembers,
    P.DeafenMembers,
    P.MoveMembers,
    P.ManageNicknames,
    P.MentionEveryone,
    P.SendPolls,
  ]);
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', env.clientId);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', permissions.bitfield.toString());
  if (env.guildId) url.searchParams.set('guild_id', env.guildId);
  console.log(url.toString());
}
