# Validação da Fase 1 — 21/10/2026

Execução real no ambiente de desenvolvimento, com Node.js 24.19.0, Next.js 16.4.2 e SQLite nativo. Nenhuma conta comercial ou API paga foi utilizada.

| Verificação                                                           | Resultado                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instalação pelo lockfile (`npm ci`)                                   | Concluída                                                                                                                                                                                                                           |
| Configuração e migrations (`npm run setup`), incluindo repetição      | Concluídas; configuração existente preservada                                                                                                                                                                                       |
| Criação de administrador por terminal, com senha oculta e confirmação | Validada em banco temporário separado                                                                                                                                                                                               |
| Testes de regras e API (`npm test`)                                   | 35 testes passaram; nenhum falhou, foi pulado ou desativado                                                                                                                                                                         |
| Fluxo no navegador (`npm run test:e2e`)                               | 2 testes passaram: computador e celular, em Chromium                                                                                                                                                                                |
| Lint, TypeScript e build de produção                                  | Passaram                                                                                                                                                                                                                            |
| Servidor de produção por HTTP local                                   | Página, login, cookie Secure/HttpOnly/SameSite, sessão e proteção de origem validados                                                                                                                                               |
| Persistência após recarregar a página                                 | Validada no navegador                                                                                                                                                                                                               |
| Backup e restauração                                                  | API de backup SQLite executada; banco restaurado preservou três contas e publicações; `integrity_check` retornou `ok`                                                                                                               |
| Dependências de produção (`npm audit --omit=dev`)                     | Nenhuma vulnerabilidade conhecida relatada na execução                                                                                                                                                                              |
| Docker Compose                                                        | Configuração validada com `docker compose config --quiet`                                                                                                                                                                           |
| Build da imagem Docker                                                | **Não concluído neste ambiente:** resolução DNS `EAI_AGAIN` no acesso a `registry.npmjs.org` dentro do builder. Tentados proxy fornecido, CA confiável por secret mount e rede host, sem desativar TLS. Execução via Node funciona. |

Os testes de navegador percorreram login, importação de quatro candidatos, revisão de regras, cadastro de oferta, rejeição de vendedor de outra plataforma com erro visível no formulário, cálculo de R$ 240 teóricos, aprovação, geração e edição, cópia real para área de transferência, registro manual de publicação e persistência. A largura de celular não apresentou rolagem horizontal na página inicial. A validação móvel usa Chromium com viewport móvel, não um aparelho físico ou Safari.

Os testes de API também criaram três contas por convites únicos, tentaram elevar privilégios de operador, verificaram regras de categoria/loja oficial/pagamento/público, limites e validade, duplicidade, divergência de vendedor, invalidação de mensagens antigas, repetição consciente de publicação, criptografia e ausência de segredos nas respostas/auditoria. Copiar não produziu publicação.

## Estado da entrega

- O banco normal não tem contas padrão nem fixtures de teste. Crie sua própria conta com `npm run owner`, usando senha privada, e convide os dois sócios.
- Exemplos só são inseridos por ação explícita do administrador e são identificados na interface. Mensagens geradas de exemplos também recebem aviso de conteúdo fictício.
- `.env.local`, banco, backups, dependências e artefatos de teste são ignorados pelo Git. Não compartilhe esses arquivos como código-fonte.
- A versão de produção foi executada localmente, mas não houve publicação na internet, configuração de domínio ou validação em hospedagem externa.
- Credenciais de marketplaces não foram solicitadas nem testadas. APIs, OCR, IA externa e envio automático continuam pendentes. Não há alegação de comissões ou rastreamento funcionando.
- Dockerfile/Compose foram entregues, mas o build do contêiner precisa ser confirmado em um servidor com rede funcional para o registry. A alternativa por Node já foi exercitada.
- Publicar o ambiente de desenvolvimento no produto é diferente de hospedar o aplicativo na internet.

Consulte o README para execução, primeiro acesso, testes, backup e publicação. A validação acima descreve a máquina atual; não estabelece que um novo ambiente ou provedor externo já foi testado.
