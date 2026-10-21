# Radar de Ofertas IA

## Atualizar uma instalação existente (Windows)

**Já criou sua conta e tem dados no Radar?** Preserve a pasta antiga. Baixe esta versão em outra pasta e execute **ATUALIZAR_RADAR.cmd** na pasta nova; informe o caminho da instalação antiga. O atualizador cria backup, preserva `.env.local`, banco e usuários, instala dependências e aplica migrations sem recriar contas. Ao terminar, abra **INICIAR_RADAR.cmd na pasta antiga** e use o mesmo login. Consulte [o passo a passo do Mercado Livre](docs/MERCADO-LIVRE.md).

**Estado da integração:** o conector foi implementado, mas a descoberta ao vivo está bloqueada por ausência de autorização de API e não foi validada para a conta do administrador. Conta de afiliado não equivale a aplicação autorizada. Sem token/permissão, não há produtos reais obtidos automaticamente. Amazon, Shopee e OCR continuam pendentes.

## Baixar e visualizar no Windows

No GitHub, abra a branch `codex/mercado-livre-radar-20261021` e clique no botão verde **Code → Download ZIP**. Depois clique com o botão direito no ZIP baixado → **Extrair tudo → Extrair**. Trabalhe na pasta extraída, não dentro do arquivo compactado.

Para ver as capturas sem instalar nada, abra **VER_IMAGENS.html** ou **VER_IMAGENS.pdf** com dois cliques. São capturas da Fase 1; o dashboard tem dados fictícios identificados. A galeria não é o aplicativo interativo nem comprova a integração nova.

Para testar o aplicativo, instale Node.js **24 LTS (24.15 ou superior dentro da série 24)** pelo site oficial `nodejs.org`. Abra **INICIAR_RADAR.cmd** com dois cliques. Ele instala as dependências gratuitas, prepara o banco local, pede que você crie sua conta pessoal de administrador e abre o navegador quando o servidor estiver pronto. A senha é digitada no terminal e permanece oculta. Mantenha essa janela aberta durante o teste; para encerrar, use Ctrl+C.

Depois de entrar, clique em **Experimentar com exemplos** na Visão geral. A execução fica somente no computador, separada do banco da nuvem, sem publicação ou contratação de serviços. O iniciador foi preparado para Windows e sua sintaxe/pré-requisitos foram verificados em Linux; ele ainda não foi executado em um Windows real. Veja também **LEIA_PRIMEIRO_WINDOWS.txt**.

O GitHub preserva o código desta versão. Arquivos privados de configuração, banco, contas e backups locais ficam fora do Git; a conta de administrador deve ser criada em cada instalação nova. Não apague o ambiente da nuvem sem fazer os backups privados descritos abaixo, caso tenha inserido dados reais nele.

---

Aplicativo privado de curadoria de ofertas, em português brasileiro. **A versão 0.2 mantém o fluxo manual e acrescenta um conector Mercado Livre condicionado a autorização testada.** O nome do produto não significa que exista uma IA externa conectada: o parser de cupons, o score e as mensagens usam regras determinísticas, sem custos de chamadas de IA.

## O que você já consegue fazer

- Criar um administrador, convidar os dois sócios e controlar permissões individuais. Não há cadastro público nem senhas padrão.
- Cadastrar e editar vendedores, grupos, ofertas, fotos por URL e links de afiliados colados manualmente.
- Navegar por cartões ou tabela e filtrar plataforma, categoria, grupo, vendedor, preço, score, status, cupom e última conferência.
- Colar texto com vários cupons, revisar cada candidato e cadastrar regras de categoria, vendedor, validade, compra mínima, teto, pagamento e público.
- Calcular preço **teórico**, aprovar/rejeitar, gerar e editar mensagens, copiar para publicação manual e registrar a publicação por grupo.
- Conferir manualmente preço e seller ID, detectar divergências, construir histórico próprio, consultar auditoria e exportar dados de trabalho.
- Guardar credenciais cifradas, testar o acesso oficial do Mercado Livre e salvar buscas com recorrência. A busca só pode ser executada após a API aceitar a autorização. Guardar um token não prova permissão.
- Separar explicitamente ofertas reais e exemplos, preservar históricos e comparar com a mediana observada quando houver amostra suficiente.

Sem informação suficiente, o sistema mostra “desconhecido” ou pede revisão. Dados fictícios são opcionais e têm selo **Exemplo**. Ofertas que usam vendedor, cupom ou grupo de exemplo também são marcadas como exemplo.

## Executar pela primeira vez

Você precisa de **Node.js 24.15 ou superior dentro da versão 24**, npm e um terminal. Não precisa contratar Supabase, serviço de autenticação ou API de IA.

Na pasta do projeto, execute um comando por vez:

```bash
npm ci
npm run setup
npm run owner
npm run dev
```

`setup` cria `.env.local` com uma chave aleatória privada e prepara o banco. Se o arquivo já existir, preserva a configuração e as chaves preenchidas. `owner` pergunta seu nome, e-mail e uma senha de pelo menos 12 caracteres; a senha não aparece na tela. O administrador é criado **uma única vez**, no banco que você configurou.

Abra o navegador no endereço local indicado pelo servidor, porta 3000. Entre com sua conta. Em **Administração → Convidar sócio**, cadastre cada um dos dois operadores. Copie o link privado exibido e envie pessoalmente ao destinatário. O aplicativo não envia e-mails. O convite expira em 48 horas e só pode ser aceito uma vez. Cada sócio escolhe a própria senha.

Se alguém esquecer a senha, o administrador pode alterá-la em Administração, confirmando sua própria senha. A recuperação automática por e-mail e MFA ainda não estão implementadas. Guarde o acesso do administrador e backups em local seguro.

## Testar o fluxo na interface

1. Na Visão geral, clique em **Experimentar com exemplos**. Isso cria três ofertas, um vendedor, um grupo e um cupom fictícios, todos identificados. Não conecta serviços externos.
2. Abra **Central de cupons** e cole este texto fictício:

```text
Cupom CASA30: 30% de desconto, limitado a R$ 60, mínimo R$ 100
Cupom PET10: 10% de desconto
Cupom BELEZA20: 20% de desconto
Cupom FIXO15: R$ 15 de desconto
```

3. Clique em **Analisar texto**. São apresentados quatro candidatos, ainda não salvos. Em cada um, use **Revisar e cadastrar**. Para simular elegibilidade de CASA30, selecione Mercado Livre, categoria Casa, informe início passado e fim futuro, status “Aparentemente ativo”, fonte “Exemplo fictício” e revise as condições. Limpe uma pendência somente depois de esclarecê-la. Marque a declaração de revisão e salve. Não marque um cupom real como válido com base neste exemplo.
4. Em Radar de ofertas, crie uma oferta de Casa por R$ 300 com o vendedor de exemplo, o cupom e o grupo de exemplo. Preencha uma URL HTTPS. O resultado será **R$ 240 estimados**: 30% seriam R$ 90, mas o teto limita o desconto a R$ 60.
5. Abra **Revisar oferta**, confira os motivos do score e aprove. Em categorias sensíveis com autenticidade desconhecida, é obrigatória uma justificativa humana. Vendedores bloqueados/de risco impedem aprovação.
6. Use **Gerar mensagem**, selecione o grupo, edite o rascunho e salve. Clique em **Copiar mensagem**. Nada foi enviado nem marcado como publicado.
7. Para testar, registre a publicação manual do exemplo. Em uso real, faça isso somente depois de publicar de fato no grupo. Uma repetição exige confirmação explícita.

Não divulgue os produtos ou códigos fictícios como ofertas reais. Para operar de verdade, cadastre seus próprios dados e links autorizados. Ao alterar produto, preço, vendedor ou regras do cupom, a aprovação é invalidada e mensagens antigas precisam ser geradas novamente.

## Testes automatizados

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Os testes de regras/API usam bancos temporários e verificam o fluxo com três contas, RBAC, convites, criptografia, auditoria, cupons, duplicidade, conferência e publicação. Playwright verifica a interface em Chromium com tamanhos de computador e celular, incluindo login, importação, cálculo, aprovação, edição, área de transferência, publicação e persistência.

O teste de navegador usa **somente `data/e2e.sqlite`**, recriado a cada execução. As credenciais de fixtures presentes em `tests/` e `e2e/` não criam contas no banco normal. Nunca use esse banco ou essas contas em produção.

Se Chromium estiver instalado em `/usr/bin/chromium`, ele é utilizado. Para outro executável, defina `CHROMIUM_PATH`. Caso não exista, instale o navegador de teste:

```bash
npx playwright install chromium
npm run test:e2e
```

Linux pode precisar das bibliotecas do navegador (`npx playwright install --with-deps chromium`, com permissão de administrador da máquina). Não é necessário instalar navegador para executar o aplicativo. Testes E2E usam a porta 3100, que precisa estar livre.

## Publicar com baixo custo

**O projeto não foi publicado na internet.** Esta versão usa um único processo Node e SQLite com disco persistente. Uma hospedagem que apaga arquivos a cada execução, ou várias réplicas com bancos separados, não serve para este modelo. Vercel/serverless com SQLite local não é um destino adequado. Para esse tipo de hospedagem, será necessária uma migração para PostgreSQL gerenciado e autenticação/repositório compatíveis.

Opção simples: um servidor Linux com Docker, disco persistente, domínio e HTTPS. O servidor pode ter custo mensal. Planos gratuitos dependem dos limites e da oferta vigente; não se promete gratuidade permanente. Você escolhe o provedor antes de contratar. Nenhum serviço é contratado por este projeto.

1. Copie o projeto para o servidor. Gere a configuração com `npm run setup` ou crie `.env.local` a partir de `.env.example`, preenchendo a chave de criptografia conforme as instruções do arquivo.
2. Defina `APP_URL=https://seu-dominio` em `.env.local`. Não coloque segredos no Git. `DATABASE_PATH` é substituído pelo caminho persistente no Compose.
3. Execute `docker compose up -d --build`.
4. Configure um proxy reverso com HTTPS (por exemplo Caddy ou Nginx) para encaminhar o domínio à porta 3000 local. O Compose expõe essa porta somente no loopback do servidor. Preserve o Host e a origem pública. Acesso por IP/HTTP não é configuração de produção suportada: o cookie de sessão exige HTTPS.
5. Execute `docker compose exec app npm run owner` no terminal do servidor e crie sua conta. **O volume Docker começa vazio**: seu banco local não é copiado automaticamente. Convide os dois sócios pela interface.
6. Teste login, permissões e uma oferta de exemplo pelo endereço HTTPS, antes de inserir credenciais reais.

Alternativa sem Docker: configure `APP_URL` com seu domínio HTTPS, execute `npm ci`, `npm run setup`, `npm run owner`, `npm run build` e `npm run start`; mantenha o processo com o gerenciador de serviços do servidor e o mesmo proxy HTTPS. A aplicação escuta a porta 3000. Firewall deve permitir o acesso público somente pelo proxy HTTPS.

O Dockerfile/Compose é fornecido como caminho de implantação; consulte `docs/VALIDACAO.md` para distinguir o que foi efetivamente executado no ambiente atual. Configurar domínio, provedor e publicar exige o acesso à hospedagem escolhida.

## Configuração e segurança

| Configuração                 | Para que serve                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_PATH`              | Arquivo do SQLite. Padrão: `./data/radar.sqlite`. Use disco persistente.                                           |
| `APP_URL`                    | Origem exata do aplicativo. Obrigatória em produção e usada na proteção de origem e nos convites.                  |
| `INTEGRATION_ENCRYPTION_KEY` | Chave hexadecimal de 32 bytes para cifrar credenciais com AES-256-GCM. Gerada por `setup`; mantenha cópia privada. |

Senhas são derivadas com scrypt e sal aleatório. Sessões usam tokens aleatórios, armazenados como hash, cookies HttpOnly/SameSite=Strict e Secure em produção. Mutações verificam origem e autorização no servidor; há limites de tentativas e tamanhos de requisição. O backend consulta somente caminhos fixos da API oficial do Mercado Livre usando HTTPS; não consulta URLs arbitrárias fornecidas pelo usuário. Uploads e OCR não estão implementados. Imagens HTTPS são carregadas diretamente pelo navegador e podem informar seu IP ao servidor da imagem.

Apenas o administrador pode guardar/substituir credenciais, convidar usuários e administrar configurações. Credenciais não voltam para o navegador, exportações ou logs. Não existem configurações financeiras nem rastreamento de comissão nesta fase; novos módulos financeiros devem manter a mesma restrição. A auditoria registra ações e dados de trabalho; não registre informações pessoais em justificativas.

Para começar, **nenhuma credencial de Mercado Livre, Amazon ou Shopee é necessária**. Crie links pelos meios autorizados de cada programa e cole-os manualmente. Antes de divulgação real, confirme regras do programa e os canais permitidos. Para descoberta pelo Mercado Livre é necessária autorização de API: o teste consulta a conta e a busca oficial e só então habilita as operações. A integração ao vivo ainda não foi validada para a conta do administrador. Amazon e Shopee continuam sem conectores. Veja docs/MERCADO-LIVRE.md.

## Backup e restauração

```bash
npm run backup
# ou: npm run backup -- /caminho/seguro/radar-backup.sqlite
```

O backup usa a API de backup do SQLite, consistente mesmo com WAL. Uma exportação JSON pela interface **não substitui** esse backup. No Docker: `docker compose exec app npm run backup`, e depois copie o arquivo do volume para fora do servidor. Guarde backups cifrados, com acesso restrito, e mantenha a chave `INTEGRATION_ENCRYPTION_KEY` em outro local seguro. Sem a chave original, as credenciais salvas não poderão ser recuperadas.

Para restaurar: pare o aplicativo; preserve o diretório de dados atual; coloque o arquivo de backup em um diretório de dados vazio, apontado por `DATABASE_PATH`; restaure a mesma chave de criptografia; ajuste permissões para o usuário do processo; inicie o aplicativo. Não misture um backup com antigos arquivos `-wal`/`-shm`. Teste o login e dados antes de reabrir o acesso. Backups contêm hashes de senha, sessões e dados da equipe: trate-os como privados.

## Organização e próximas fases

```text
src/app/             páginas, estilos e API autenticada
src/components/      interface responsiva em português
src/lib/domain.ts    elegibilidade, parser, score e mensagens
src/lib/repository.ts persistência e regras de alterações
src/lib/auth.ts      senhas, sessões, RBAC e criptografia
migrations/          evolução versionada do banco
scripts/             configuração, administrador, migrations e backup
tests/               regras e integração de API
e2e/                 fluxo real no navegador
docs/                arquitetura, limites e validação
```

- **Fase 1:** fluxo manual implementado nesta versão. Modelos de mensagem são os três estilos do gerador; editor livre por rascunho. O editor de modelos reutilizáveis por grupo é uma expansão pendente, não um botão simulado.
- **Fase 2 (esta etapa):** conector Mercado Livre com credencial, teste de acesso, busca de até 10 anúncios, detalhes/vendedor, histórico próprio, agendamento e separação de exemplos. Operação real depende de API autorizada, ainda não validada para a conta. OCR, outras plataformas e histórico externo ficam para etapas seguintes.
- **Fase 3:** PostgreSQL/mais escala quando necessário, ranking por público, métricas reais acessíveis, notificações e Telegram autorizado.

O parser não entende qualquer formato de mensagem, categorias não são inferidas sem confirmação, não há coleta de mensagens privadas, scraping, push ou envio automático. A recorrência do Mercado Livre exige processo local aberto e autorização de API confirmada. Restrições de pagamento/público não confirmadas deixam o cálculo pendente. Histórico só exibe estatísticas com pelo menos 10 observações em 7 dias distintos na janela; essa amostra continua sem provar a mínima histórica de mercado. Score é uma heurística explicável, não um modelo de conversão.

Auditoria inicial: [docs/AUDITORIA-FASE-2.md](docs/AUDITORIA-FASE-2.md). Guia e limites do conector: [docs/MERCADO-LIVRE.md](docs/MERCADO-LIVRE.md).

Detalhes técnicos e decisões: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
