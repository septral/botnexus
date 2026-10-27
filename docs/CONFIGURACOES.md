# Configurações

Todas as opções abaixo ficam disponíveis em `/botconfig` e são validadas antes de serem salvas.

- **Identidade visual:** nome, cor e rodapé.
- **Módulos:** IA, moderação, AutoMod, comunidade, tickets, verificação, níveis, economia, diversão e utilidades.
- **Comandos e respostas:** comandos desativados, comandos com resposta pública e cooldown.
- **AutoMod:** perfil moderado por padrão, rajadas e duplicações com janelas configuráveis, menções, caixa alta, linhas, emojis, conta, arquivos, palavras, exceções, avisos progressivos e timeout após reincidência.
- **Tickets · estrutura:** categoria padrão, atendentes, supervisores, administradores, auditoria, distribuição e DMs.
- **Tickets · painéis:** título, cor, imagem, texto, rótulo e estilo do botão.
- **Tickets · mensagens:** abertura, encerramento, aviso e respostas rápidas no formato `nome|texto`.
- **Tickets · automações:** simultâneos, cooldown, duplicados, inatividade, encerramento, aviso, SLA e limpeza.
- **Tickets · arquivo e avaliação:** HTML/JSON, canal de arquivo, DM, avaliações e anonimato.
- **Tickets · permissões:** controle de encerramento por usuário, atendente e supervisor.
- **Tickets · departamentos:** criação, edição e exclusão pelo próprio painel, com categoria e cargo opcionais.
- **Salas temporárias:** categorias, canais geradores, cargos VIP, limites, bitrate, textos e logs.
- **Verificação:** cargo, CAPTCHA, validade, tentativas, bloqueio, idade mínima da conta e auditoria.
- **Economia:** moeda, canal de trabalho, recompensas, cooldown, recibos e multiplicadores VIP.
- **VIP e gift cards:** três cargos, painel de resgate, logs, lembretes, identidade N3XUS e os doze preços por duração.
- **Sugestão de IA:** ativação, categoria, tamanho do contexto, criatividade e personalidade.
- **Demais seções:** boas-vindas, logs, moderação, verificação, níveis, economia e comunidade.

O JSON exportado pelo painel não contém tokens. `GROQ_API_KEY` e o token do Discord existem somente no `.env`.
