# Auditoria antes da integração — 21/10/2026

## Verificado no sistema recebido

- 35 testes de regras/API passaram antes das alterações. Autenticação, convite de três contas, permissões no servidor, cadastro/edição manual, elegibilidade teórica, aprovação, mensagens, cópia, declaração de publicação, histórico próprio e backup são implementações reais.
- O gerador de mensagens é determinístico; não há IA externa. O parser de texto separa candidatos, mas exige revisão humana e não interpreta qualquer formato. OCR de prints não está implementado.
- As integrações existentes guardam uma credencial cifrada, sem consultar a plataforma. Estado `configured` não demonstra funcionamento. Não há busca, sincronização, worker ou criação automática de links de afiliados.
- Exemplos são identificados, mas as consultas iniciais devolvem exemplos e dados reais na mesma coleção. Será necessário separar as visualizações explicitamente, mantendo os registros existentes.
- O score é uma heurística sobre informações manuais. Não mede vendas, popularidade, estoque ou autenticidade. Reputação excelente não comprova originalidade. Histórico exige amostra mínima e não representa todo o mercado.
- Um link comum pode ser usado como destino na mensagem, mas isso não o torna um link de afiliado. Links colados como afiliados têm validação apenas sintática, sem confirmação de rastreamento ou comissão.
- O banco da nuvem é diferente do banco do Windows. Os usuários e dados do computador do administrador não estão disponíveis nesta máquina. Uma atualização deve preservar `.env.local`, `data/`, senha e chave de criptografia no computador, com backup antes das migrations.

## Acesso externo encontrado

- Não há credenciais de marketplaces na configuração da nuvem ou nas integrações do banco desta máquina. A chave local de criptografia está configurada; não foi exibida nem copiada.
- O administrador confirmou que possui somente conta de afiliado do Mercado Livre, sem aplicação no DevCenter. Conta de afiliado não equivale a autorização de API para buscar no catálogo.
- Tentativas reais de acesso à documentação e à API do Mercado Livre foram bloqueadas pelo proxy da nuvem (`CONNECT 403`), antes de uma resposta da plataforma. Isso não demonstra indisponibilidade da API nem autorização da conta.
- Domínios oficiais necessários foram acrescentados ao rascunho de rede: `developers.mercadolivre.com.br`, `api.mercadolibre.com`, `auth.mercadolivre.com.br`. Salvar o rascunho não aplica ou publica a configuração.
- O SDK oficial antigo consultado no GitHub (`mercadolibre/python-sdk`) informa que deixou de ser mantido em abril de 2021. Não será instalado nem tratado como prova de disponibilidade atual de busca pública. A documentação oficial vigente e as permissões da aplicação continuam necessárias.

Uma tentativa posterior via Node com a configuração de proxy retornou HTTP 403 com HTML da plataforma para a API e a documentação. Não houve JSON de produtos nem consulta autenticada. O bloqueio continua sem diagnóstico suficiente para afirmar a disponibilidade do acesso da aplicação.

## Escopo escolhido

Primeiro conector: Mercado Livre, por HTTPS na API oficial, sem scraping e sem geração presumida de links de afiliados. O conector só ficará habilitado para agendamento depois de testar a credencial e a permissão de busca com resposta válida. Respostas externas devem ser validadas; erros, ausência de vendedor ou dados incompatíveis não podem virar produtos fictícios.

Sem aplicação, token autorizado e acesso de rede, a descoberta real permanece bloqueada. Testes automatizados com respostas controladas verificam comportamento, mas não substituem um teste ao vivo autorizado e não podem ser apresentados como ofertas reais.
