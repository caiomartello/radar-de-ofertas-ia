# Mercado Livre — conector e teste no navegador

**Atualização 0.3:** o fluxo OAuth e a renovação foram implementados. Consulte [OAUTH-MERCADO-LIVRE.md](OAUTH-MERCADO-LIVRE.md) para a URI exata, configuração no navegador, testes e requisitos de HTTPS. A validação ao vivo continua pendente.

## Situação real desta entrega

O conector foi implementado, mas **a descoberta ao vivo ainda não foi validada nem ativada para a conta do administrador**. O administrador possui somente conta de afiliado; não foi fornecida autorização de uma aplicação para consultar a API. A tentativa sem token retornou HTTP 403, com uma página HTML de bloqueio. Isso pode envolver autorização ou filtros da plataforma/rede e não prova que uma aplicação aprovada terá acesso.

Não houve produtos reais importados nesta validação. Os testes de importação usam respostas controladas exclusivamente em bancos temporários, sem apresentar essas fixtures como ofertas reais no banco de trabalho. O SDK antigo oficial foi usado apenas como referência histórica e não foi instalado; a documentação vigente não pôde ser consultada por este ambiente. O contrato suportado deve ser confirmado pela resposta real da aplicação autorizada.

## Antes de conectar

1. Consulte a documentação vigente do Mercado Livre: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao e https://developers.mercadolivre.com.br/pt_br/itens-e-buscas.
2. Cadastre uma aplicação no DevCenter e confirme se a plataforma concede à sua aplicação o acesso de leitura necessário para buscar anúncios, consultar detalhes e reputação. Isso não é obtido automaticamente com a conta de afiliado.
3. Use o fluxo OAuth de Integrações para conectar sua aplicação. O servidor recebe e cifra os tokens, com renovação quando fornecida pela plataforma. Alternativamente, a opção avançada permite colar um access token obtido pelo fluxo oficial, sem renovação automática. Sua senha, código de afiliado, Client ID isolado ou link de produto não são tokens. Não há promessa de que a aprovação ou a busca ampla estejam disponíveis para sua conta. Não forneça segredos pelo chat.
4. Se a plataforma não autorizar a busca, mantenha o conector desligado. Não use scraping, credenciais de terceiros, proxies para contornar bloqueios ou endpoints inventados.

## Atualizar o aplicativo do Windows preservando seus usuários

1. Feche a janela preta do Radar antigo. Anote a pasta onde ele está instalado.
2. Baixe a branch `codex/mercado-livre-oauth-20261021` pelo GitHub: **Code → Download ZIP**. Use **Extrair tudo** em outra pasta.
3. Na pasta NOVA, abra **ATUALIZAR_RADAR.cmd**. Cole o caminho completo da pasta ANTIGA quando solicitado. Para copiar o caminho, abra a pasta antiga no Explorador e clique na barra de endereços.
4. O atualizador salva um backup consistente do SQLite, uma cópia privada da configuração e o código anterior em `data/backups/antes-da-atualizacao-...` da instalação antiga. Depois atualiza somente arquivos de código, instala o lockfile e aplica migrations aditivas. `.env.local`, banco, contas, sessões, permissões, listas manuais e arquivos pessoais são preservados. O backup contém dados privados; não o envie ao GitHub nem ao chat.
5. Ao terminar, volte à pasta ANTIGA e abra **INICIAR_RADAR.cmd**. Entre com o mesmo e-mail e a mesma senha. O iniciador também abre o processo de agendamento.

Não inicie uma instalação nova se quer manter os dados da instalação antiga. O atualizador foi exercitado em Linux com uma instalação antiga de teste e preservação de banco/configuração; o arquivo `.cmd` ainda precisa de confirmação em um Windows real. Se a instalação de dependências falhar, o backup permanece disponível. Não apague o backup nem a chave de criptografia.

## O que testar na interface

1. Clique em **Ver ofertas reais**. Os exemplos ficam exclusivamente em **Ver exemplos**, inclusive vendedores, grupos, cupons, rascunhos e publicações associados. Novos registros na área de exemplos são marcados como fictícios. O histórico administrativo de auditoria inclui os dois modos para rastrear alterações.
2. Abra **Integrações → Radar automático · Mercado Livre**. Sem autorização, o estado será “Acesso de API não configurado”. O token só pode ser guardado pelo administrador e é cifrado com a chave preservada do servidor.
3. Conecte por OAuth e use **Testar autorização de busca**. Para token manual, abra **Opção avançada: token obtido manualmente**, confirme a declaração e use **Cifrar e salvar token** antes do teste. O teste consulta `/users/me` e `/sites/MLB/search`, valida os formatos e registra o resultado. Guardar o token ou conectar por OAuth não ativa o conector. Um perfil autenticado com busca negada também não ativa o conector.
4. Em **Radar de ofertas**, salve um termo de busca. A busca é salva no banco, inicialmente com agendamento desligado; isso pode ser testado mesmo sem token. **Buscar agora na API** só fica disponível depois do teste de acesso. A consulta usa até 10 anúncios por execução e busca os detalhes e vendedores na API; não extrai dados do HTML das lojas.
5. Verifique o **Histórico das últimas execuções**: recebidos, novos, atualizados, ignorados, requisições, falhas e motivos. Erros podem ocorrer depois de importações parciais; nesse caso o histórico informa o que foi preservado. Nenhum botão de consulta devolve produtos fictícios como fallback.
6. Ofertas importadas são reais e ficam em revisão. Confirme categoria e condições antes de vincular um cupom; keywords de busca não classificam automaticamente o produto. Anúncios com variações, dados insuficientes, moeda estrangeira, vendedor divergente, inativos ou sem estoque são ignorados e explicados. Se já existirem, voltam para revisão com alerta. Uma consulta válida posterior resolve alertas de indisponibilidade; divergências de vendedor exigem revisão própria.
7. O preço original da API é identificado como referência anunciada, **não** como preço habitual. A comparação com mediana própria só aparece com pelo menos 10 observações em 7 dias distintos, nos últimos 30 dias, anteriores à consulta atual. Isso não prova mínima histórica de mercado. Volume/reputação são mostrados somente quando a API fornece os dados; não garantem originalidade. Listas confiáveis/bloqueadas e evidências humanas são preservadas.
8. Para recorrência, confirme que sua aplicação permite consultas periódicas e use **Habilitar agendamento**. Mantenha a janela do Radar aberta. O agendador verifica tarefas a cada minuto, respeita os intervalos de 30 minutos ou mais, executa uma tarefa por vez por processo e usa travas no banco para a mesma busca. Há orçamento global de 120 tentativas de requisição por hora, sem tentativas automáticas imediatas. HTTP 429 cria uma espera conforme `Retry-After`; token recusado ou busca negada suspendem novas consultas até nova validação.

No terminal, o agendador também pode ser iniciado por `npm run radar:worker`, no diretório do projeto. Processo ativo, credencial e agendamento são condições independentes: o indicador de processo detectado não significa que a busca está autorizada.

## Links, mensagens e próximos passos

O conector **não gera links de afiliados**. URLs recebidas são links comuns e assim são identificadas nas mensagens. Um link criado manualmente pelo programa autorizado pode ser colado; o sistema informa que o rastreamento não foi verificado. Nenhuma consulta valida comissão. Preço com cupom continua teórico; cupons não são adicionados automaticamente só por correspondência de palavras.

Amazon, Shopee, OCR de prints, extração por IA, histórico externo e envio automático permanecem fora desta etapa. Não há serviço pago contratado ou chamado por esses módulos. O uso das APIs deve obedecer às condições e limites vigentes da plataforma e da aplicação.

## Testes e rede

`npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck` e `npm run build` validam código e interface. `npm run radar:probe` faz apenas uma consulta de rede sem token, não importa dados e retorna falha quando não há acesso; isso não substitui o teste autenticado.

Na nuvem, os domínios oficiais foram adicionados ao rascunho de configuração de rede. Revisar/salvar e publicar o ambiente no produto é diferente de publicar o aplicativo na internet; não concede autorização da API. No Windows, as requisições usam a conexão local do computador. Nesta validação a API e a documentação devolveram HTTP 403 sem autenticação; não há evidência de descoberta real operacional para esta conta.
