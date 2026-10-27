import { ApplicationCommandOptionType as T } from 'discord.js';
export const D = (name, description, module, permission, options, run) => ({
  name,
  module,
  permission,
  run,
  data: {
    type: 1,
    name,
    description,
    contexts: [0],
    integration_types: [0],
    ...(permission ? { default_member_permissions: String(permission) } : {}),
    ...(options.length ? { options } : {}),
  },
});
const option = (type, name, description, required = false, extra = {}) => ({
  type,
  name,
  description,
  required,
  ...extra,
});
export const text = (name, description, required = false, extra = {}) =>
  option(T.String, name, description, required, { max_length: 1800, ...extra });
export const integer = (name, description, required = false, min = 1, max = 1000000) =>
  option(T.Integer, name, description, required, { min_value: min, max_value: max });
export const user = (name = 'usuario', description = 'Membro do servidor', required = true) =>
  option(T.User, name, description, required);
export const role = (name = 'cargo', description = 'Cargo do servidor', required = true) =>
  option(T.Role, name, description, required);
export const channel = (
  name = 'canal',
  description = 'Canal de texto',
  required = false,
  types = [0, 5],
) => option(T.Channel, name, description, required, { channel_types: types });
export const boolean = (name, description, required = false) =>
  option(T.Boolean, name, description, required);
export const attachment = (name, description, required = true) =>
  option(T.Attachment, name, description, required);
export const sub = (name, description, options = []) => ({
  type: T.Subcommand,
  name,
  description,
  options,
});
export const choices = (...items) =>
  items.map((v) => (typeof v === 'string' ? { name: v, value: v } : { name: v[0], value: v[1] }));
