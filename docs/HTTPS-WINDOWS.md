# Callback HTTPS no Windows, sem contratar hospedagem

O DevCenter exige HTTPS. **Não cadastre mais `http://localhost:3000` nem a URI HTTP antiga.** O dashboard continua nesse endereço local, mas o callback passa por um túnel temporário HTTPS com certificado público da Cloudflare.

## Opções avaliadas

| Opção                                                     | Custo e requisito                                                                                                                                                              | Decisão                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| HTTPS local com certificado confiável, por exemplo mkcert | Ferramenta gratuita, instalação de uma autoridade local no Windows, configuração de TLS; aceitação adicional de localhost/porta pelo DevCenter ainda precisaria ser confirmada | Alternativa possível, não instalada nesta entrega |
| Túnel de todo o aplicativo                                | Ferramentas gratuitas disponíveis, mas exporia login e painel e exigiria mudar a origem dos cookies                                                                            | Não é a configuração usada                        |
| Túnel temporário somente do callback                      | Cloudflare Quick Tunnel, sem conta, domínio próprio ou hospedagem paga; endereço muda a cada abertura                                                                          | Implementado para desenvolvimento                 |

A Cloudflare participa do transporte do código OAuth temporário. Client Secret, senha do Radar e tokens de longa duração não são enviados ao túnel. A autorização da conta acontece no site oficial do Mercado Livre. Quick Tunnels são para testes, sujeitos às condições e à disponibilidade do provedor; não garantem endereço fixo nem disponibilidade de produção. Nenhum serviço pago foi contratado.

## 1. Atualize o Radar preservando seu login

1. Feche a janela preta do Radar atual.
2. No seu GitHub, abra a branch **`codex/mercado-livre-https-20261021`**.
3. Clique em **Code → Download ZIP**. No arquivo baixado, clique com o botão direito → **Extrair tudo**. Extraia em outra pasta, mantendo a instalação antiga.
4. Na pasta nova, abra **ATUALIZAR_RADAR.cmd** e informe o caminho da pasta antiga. O atualizador faz backup e preserva banco, usuários, chave de criptografia e credenciais anteriores. A migration 006 só cria a tabela de retornos temporários.
5. Quando concluir, volte à pasta ANTIGA. É nela que você continuará usando o aplicativo e seu login.

Se estiver instalando pela primeira vez, use **INICIAR_RADAR.cmd**, crie sua conta, confirme o acesso e feche essa janela antes da etapa seguinte. Não crie outra conta para atualizar.

## 2. Abra o iniciador HTTPS

1. Na pasta antiga já atualizada, abra **INICIAR_RADAR_HTTPS.cmd** com dois cliques. Não deixe o iniciador antigo aberto ao mesmo tempo: ambos usam a porta 3000.
2. Na primeira vez, se o Cloudflared não estiver instalado, o iniciador tenta instalar o pacote gratuito oficial **Cloudflare.cloudflared** pelo WinGet do Windows. Confirme as perguntas do instalador após conferir o nome do pacote. Não é necessário criar conta na Cloudflare, fornecer cartão, senha de marketplace ou contratar plano.
3. Se o Windows não encontrar WinGet, instale/atualize o aplicativo gratuito **Instalador de Aplicativo**, da Microsoft, pela Microsoft Store, feche a janela e reabra **INICIAR_RADAR_HTTPS.cmd**. Como alternativa, com WinGet disponível, o comando oficial é:

```powershell
winget install --id Cloudflare.cloudflared --exact --source winget
```

4. Aguarde a preparação das dependências e o teste do callback. **Não use um endereço encontrado em mensagens de erro ou de instalação.** O iniciador só libera a URI quando uma requisição HTTPS ao endereço público passa pelo receptor e recebe uma prova assinada da própria instância do Radar.
5. Aguarde a mensagem **CALLBACK HTTPS VERIFICADO. CADASTRE EXATAMENTE ESTA URI NO DEVCENTER**. A linha seguinte contém sua URI completa, realmente gerada para essa abertura. Ela também é salva em **data → URI_REDIRECT_MERCADO_LIVRE.txt**. Esse arquivo contém somente o endereço e sua validade, sem credenciais.

Se o teste falhar, o iniciador encerra e não libera uma URI. Não desative firewall, validação de certificados ou proteções do Windows para contornar o erro. Uma rede corporativa pode bloquear túneis. As instruções de rede vigentes do provedor estão em https://github.com/cloudflare/cloudflared; o código oficial de Quick Tunnel está em https://github.com/cloudflare/cloudflared/blob/master/cmd/cloudflared/tunnel/quick_tunnel.go. O instalador e o túnel não foram executados em um Windows real nesta máquina Linux.

## 3. Cadastre a URI no DevCenter

1. Com a janela HTTPS aberta e a verificação concluída, abra **http://localhost:3000** no MESMO computador Windows e no mesmo navegador que será usado na autorização.
2. Entre com sua conta de administrador e clique em **Ver ofertas reais → Integrações**.
3. Se a tela foi aberta antes da verificação, clique em **Atualizar verificação HTTPS**. A atualização também acontece periodicamente.
4. No campo **URI de redirect para cadastrar no DevCenter**, clique para selecionar e copie o valor completo com **Ctrl+C**. Ele deve corresponder ao arquivo e à mensagem do iniciador.
5. No DevCenter, abra sua aplicação e cole esse valor em **URI de redirect**. Salve. Não acrescente barra, parâmetros ou fragmentos e não cadastre a URL do dashboard. Não é necessário recriar a aplicação.
6. Se já havia uma URI de túnel antigo, substitua/remova o endereço antigo. O Quick Tunnel muda quando é reiniciado. A aceitação do domínio pelo DevCenter ainda precisa ser confirmada nesse cadastro; um teste de alcance HTTPS não concede permissões de API.

**Não existe uma URI completa fixa neste documento.** O domínio só é conhecido depois que o túnel é criado no seu Windows. Um endereço criado na nuvem do Codex apontaria para outra máquina; por isso não foi fornecido como se atendesse seu computador.

## 4. Conecte sua conta

1. No Radar, em **Integrações**, preencha Client ID e Client Secret somente se ainda não estiverem salvos. Não envie esses valores pelo chat.
2. Clique em **Salvar aplicação com segurança**, depois em **Conectar com Mercado Livre**.
3. Confira o domínio oficial do Mercado Livre no navegador e autorize sua aplicação.
4. O navegador passa pelo callback HTTPS e volta ao Radar local com um ticket temporário. O Radar verifica o navegador, a sessão, o estado e PKCE antes de trocar o código por tokens no servidor. O Client Secret e os tokens permanecem cifrados no banco local.
5. Após retornar, clique em **Testar autorização de busca**. Conectar por OAuth não garante acesso ao catálogo nem cria links de afiliados.

Mantenha a janela HTTPS aberta durante o fluxo. Para encerrar, use **Ctrl+C** e aguarde o encerramento dos processos. Ao abrir novamente, use a nova URI verificada e atualize o DevCenter antes de tentar uma nova autorização. As contas e credenciais da aplicação salvas continuam no banco; não é necessário digitá-las novamente a cada abertura.

## Proteções e limites

- O túnel aponta para um receptor separado, vinculado somente a `127.0.0.1`, em uma porta escolhida automaticamente. Ele aceita apenas GET no caminho de callback. `/`, login, dashboard, APIs de trabalho e WebSockets são recusados.
- O callback público não tem cookies locais nem troca códigos diretamente. Ele armazena o retorno cifrado e fornece um ticket aleatório de uso único, vinculado ao estado e ao navegador local; a finalização acontece em localhost. O `redirect_uri` usado na troca continua sendo exatamente a URI HTTPS cadastrada.
- Uma chave temporária entre receptor e servidor, que não é exibida, protege o endpoint interno. A prova de alcance inclui um nonce e HMAC; uma página de erro ou outro servidor não libera a URI.
- O iniciador repete a verificação a cada minuto. Falha ou verificação antiga bloqueiam novas autorizações. Estado e ticket expiram, e os cookies HttpOnly/SameSite e a renovação segura anterior continuam aplicáveis.
- `.env.local`, `APP_URL`, chave de criptografia, contas e banco não são substituídos pelo iniciador HTTPS. Endereço público e chave temporária são passados apenas aos processos dessa abertura. A janela comum **INICIAR_RADAR.cmd** continua disponível para uso local sem túnel, com nova autorização OAuth bloqueada por falta de HTTPS.
- Testes de rede local, navegador e respostas OAuth controladas não comprovam uma conexão real ao DevCenter. A verificação do túnel real será realizada pelo iniciador no seu computador, antes de exibir a URI. Nunca se deve cadastrar uma URL de exemplo ou tratar um token simulado como integração ativa.
