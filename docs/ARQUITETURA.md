# Arquitetura

- `src/core/`: SQLite, configuração, roteamento, permissões, logs e UI.
- `src/commands/`: definições e implementações dos comandos slash.
- `src/features/ai.js`: cliente GROQ, fila por canal, contexto persistente e canais de chat.
- `src/features/tickets.js`: canais privados, controles e transcript HTML.
- `src/features/events.js`: AutoMod, boas-vindas, logs, níveis e gatilhos da IA.
- `src/features/config-panel.js`: painel Discord Components v2.

O roteador aplica permissões, módulos, cooldown e visibilidade pública/privada antes de executar comandos. A IA usa uma fila por canal para preservar a ordem, só consulta a API após uma menção no chat oficial e mantém contexto curto. Tokens não são persistidos; uso diário e histórico reduzido ficam no SQLite.

O processo principal sincroniza os comandos antes do login no Gateway e repete a tentativa após cinco minutos em falhas temporárias. Exceções não tratadas acionam encerramento gracioso; a política `restart: unless-stopped` do Docker reinicia o processo limpo. O console interativo só é ativado em TTY.

Conteúdo exportado para HTML é escapado. Importação de emojis aceita apenas menções personalizadas e URLs HTTPS do CDN oficial do Discord.
