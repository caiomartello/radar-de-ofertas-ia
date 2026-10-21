# Validação da versão 0.2 — 21/10/2026

Ambiente Linux, Node.js 24, SQLite nativo e Chromium. O relatório da Fase 1 em `VALIDACAO.md` permanece como registro histórico; este documento descreve a atualização.

| Verificação                          | Resultado                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                           | 57 testes passaram, sem falhas ou testes ignorados.                                                                                                                                                                                                 |
| `npm run test:e2e`                   | 4 testes passaram: fluxo manual e novo radar, em computador e celular com Chromium.                                                                                                                                                                 |
| Lint, TypeScript e build de produção | Passaram.                                                                                                                                                                                                                                           |
| Atualização de instalação antiga     | Teste real de arquivos/SQLite preservou conta, hash de senha, sessão, permissões, configuração privada, credencial cifrada e arquivo pessoal. Backup consistente, código anterior e migrations 003/004 verificados.                                 |
| Agendador                            | Processo iniciado e encerrado no ambiente normal. Migrations aditivas e heartbeat gravados; nenhuma consulta externa sem autorização. Execução de uma tarefa vencida e bloqueio de tarefas desabilitadas também testados com transporte controlado. |
| Tentativa de rede sem credencial     | `NODE_USE_ENV_PROXY=1 npm run radar:probe`: HTTP 403 com HTML, sem importação. A documentação oficial também teve acesso bloqueado.                                                                                                                 |
| Busca autenticada ao vivo            | **Não executada:** administrador tem somente conta de afiliado, sem aplicação/token autorizado disponível. Zero produtos reais importados nesta validação.                                                                                          |
| Windows                              | Atualizador e iniciador preparados e testados quanto à lógica em Linux. Não foram executados em um Windows real nesta entrega.                                                                                                                      |

Os testes do conector injetam respostas de contrato exclusivamente em bancos temporários. Eles exercitam autenticação/permissões, cifragem, teste de perfil e busca antes de ativar, resposta 403, HTML inválido, atualização sem duplicação, preservação de links/grupos/listas humanas, troca de vendedor, estoque indisponível, invalidação de aprovação, limites 429 e `Retry-After`, token expirado, travas duráveis e separação de exemplos. Isso valida o comportamento do código diante dessas respostas; não comprova que o Mercado Livre concederá os endpoints ou dados para a aplicação do usuário.

Os quatro testes de navegador verificam login, isolamento entre exemplos e ofertas reais, busca salva desabilitada sem credencial, configuração restrita e navegação responsiva, além do fluxo existente de cupom, oferta, aprovação, mensagem editável, cópia e registro manual de publicação. Não usam token de marketplace nem inserem fixtures no banco normal.

## Limites e pendências

- Contrato e acesso da API precisam ser confirmados com uma aplicação realmente autorizada. O conector bloqueia ativação quando o formato ou a permissão falham; não usa resultados de exemplo como alternativa.
- OAuth interativo e renovação automática de tokens, Amazon, Shopee, OCR, IA externa, histórico externo, validação automática de cupons e geração/validação de links de afiliados não foram implementados nesta etapa.
- Observações próprias só permitem comparar mediana com amostra suficiente. Preço original informado pela plataforma não é apresentado como preço habitual. Reputação não comprova autenticidade.
- O computador precisa permanecer ligado com o processo de agendamento ativo. Limites locais não substituem as condições e cotas da plataforma.
- Nenhum serviço pago foi contratado e o aplicativo não foi publicado na internet. `.env.local`, bancos e backups privados permanecem fora do Git.
- As imagens e o PDF antigos são capturas da Fase 1, com exemplos; não documentam ofertas reais descobertas pela API.
