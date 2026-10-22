# Conectar o Radar ao Mercado Livre — OAuth

## URI de redirect desta instalação

**O administrador confirmou que o DevCenter exige HTTPS.** Não cadastre a URI HTTP antiga. A versão 0.4 implementa um receptor HTTPS isolado por Cloudflare Quick Tunnel e mantém o dashboard local em `http://localhost:3000`.

Abra **INICIAR_RADAR_HTTPS.cmd** no Windows e aguarde **CALLBACK HTTPS VERIFICADO**. Só então copie a URI completa exibida na janela, em Integrações ou em `data/URI_REDIRECT_MERCADO_LIVRE.txt`. Ela usa o caminho `/api/oauth/mercado-livre/callback`, servido pelo receptor público e finalizado pela rota local implementada. O domínio é gerado nessa abertura e não pode ser informado antecipadamente sem inventar uma URL.

Não acrescente barra, parâmetros ou fragmentos. Use a mesma URI na aplicação do DevCenter; o Radar já a usa tanto na autorização quanto na troca do código. Confira [HTTPS-WINDOWS.md](HTTPS-WINDOWS.md) para instalação, verificação, limitações e passos detalhados. Não altere `APP_URL` para o domínio do túnel nem desative a validação de certificados.

## Atualizar sem perder sua conta

1. Feche a janela preta do Radar antigo.
2. Abra no GitHub a branch `codex/mercado-livre-https-20261021`, clique em **Code → Download ZIP** e extraia em outra pasta.
3. Na pasta nova, execute **ATUALIZAR_RADAR.cmd** e informe o caminho da pasta antiga. O atualizador faz backup antes de copiar código e aplicar migrations aditivas até 006; banco, usuários, senha e chave de criptografia são preservados.
4. Volte à pasta antiga, abra **INICIAR_RADAR_HTTPS.cmd** e entre com o mesmo login. Não crie outra conta para atualizar.

O atualizador foi testado em Linux com uma instalação antiga; o `.cmd` não foi executado em um Windows real nesta entrega. Não apague a pasta antiga nem os backups privados.

## Onde clicar

1. No DevCenter, cadastre a URI HTTPS realmente gerada e verificada no seu Windows. Use as permissões mínimas de leitura; se a plataforma oferecer acesso offline/renovação e PKCE, habilite conforme as regras vigentes da aplicação. O Radar envia PKCE com `S256`. A concessão de refresh token depende da resposta da plataforma.
2. No Radar, abra **Ver ofertas reais → Integrações → Conectar com Mercado Livre por OAuth**.
3. Preencha **Client ID da aplicação** e **Client Secret da aplicação** somente nesse formulário local. Clique em **Salvar aplicação com segurança**. O campo do segredo é limpo ao concluir a tentativa de salvamento; o servidor guarda o valor cifrado.
4. Clique em **Conectar com Mercado Livre**. O navegador abre a autorização em `https://auth.mercadolivre.com.br/authorization`. Confira o domínio e autorize somente sua aplicação.
5. O Mercado Livre volta para o callback. O Radar confere estado, navegador, sessão, administrador, configuração e prazo, troca o código no servidor e retorna à tela de Integrações com a URL limpa. Um cancelamento preserva a conexão anterior.
6. Depois de conectar, clique em **Testar autorização de busca**. A conexão OAuth não ativa a busca automaticamente: a API ainda precisa aceitar perfil e busca de produtos. Se a plataforma negar acesso, a busca permanece bloqueada.

Não abra o callback manualmente para conectar: sem uma autorização iniciada pelo Radar, ele retorna uma falha segura. Nunca envie Client Secret, authorization code, access token, refresh token, `.env.local` ou banco pelo chat ou GitHub.

## Segurança e renovação

- Somente o administrador pode configurar, iniciar e renovar. As operações POST exigem sessão e origem igual a `APP_URL`.
- O estado aleatório tem 256 bits, prazo de 10 minutos e uso único; banco guarda somente seu hash. Há vínculo com a sessão que iniciou o fluxo e um cookie temporário HttpOnly/SameSite=Lax, restrito ao callback. O cookie normal de login permanece SameSite=Strict.
- PKCE S256 usa um verifier aleatório guardado cifrado no servidor. A troca por token usa POST de formulário em `https://api.mercadolibre.com/oauth/token`, com timeout, limite de resposta, TLS verificado e redirecionamentos recusados. Segredos não são colocados em URLs de requisição.
- Client Secret, access token e refresh token são cifrados com AES-256-GCM e a chave já existente em `.env.local`. A chave não é recriada pela atualização. Respostas JSON e auditoria não devolvem esses valores. O callback faz redirect 303 sem refletir code/state/erros externos, com `no-store` e `no-referrer`; seu log de URL está desativado no Next de desenvolvimento. Se configurar um proxy HTTPS depois, remova query strings desse caminho nos logs do proxy e preserve o Host público.
- Quando a API fornece refresh token, a renovação ocorre antes de consultas com token a 90 segundos ou menos da expiração. Uma resposta 401 pode causar uma renovação e uma única repetição da leitura. Respostas 403 não são tratadas como prova de token expirado.
- A renovação usa trava no SQLite para evitar uso simultâneo de tokens rotativos, confere a identidade da conta e grava novos tokens juntos. Se a API omitir o novo refresh token, o Radar não presume que o anterior continua válido. **Renovar token agora** executa a mesma operação no servidor, sem mostrar o token.
- HTTP 429 respeita `Retry-After`, preserva a credencial e bloqueia novas tentativas durante a espera. Erro de autorização, conta divergente, resposta incompatível, resultado de rede incerto ou renovação interrompida exigem reconexão; um token possivelmente consumido não é repetido silenciosamente.
- **Desconectar** apaga os tokens locais e autorizações pendentes e desliga buscas agendadas; preserva ofertas, histórico e configuração cifrada da aplicação. Isso não revoga a aplicação nos servidores do Mercado Livre: a revogação externa deve ser feita nos controles de segurança da plataforma, se desejada. A opção avançada de colar um token continua disponível, mas não fornece renovação automática.

O aplicativo e o worker usam o mesmo banco. Não é preciso criar um agendador de renovação separado: ela ocorre quando há consulta que necessita do token. Mantenha o iniciador aberto para executar buscas recorrentes autorizadas.

## Validação e limites

Os testes automatizados usam bancos temporários e respostas controladas: configuração, callbacks válidos/inválidos, cancelamento, uso único, expiração, PKCE, sessão encerrada, cifragem, renovação, concorrência, 429 e ausência de refresh token. O Chromium também percorre configuração e retorno cancelado a partir de uma página externa interceptada de teste, verificando que o callback recebe o cookie Lax e não recebe o cookie de login Strict. Isso não usa uma conta comercial.

O fluxo com uma aplicação real ainda precisa ser confirmado pelo administrador no DevCenter. Não há Client Secret ou tokens reais disponíveis nesta máquina, e a documentação oficial continuou bloqueada com HTTP 403. Não houve acesso autenticado ao vivo, produtos importados ou promessa de que a API concederá busca à aplicação. Nenhum serviço pago foi contratado. No modo HTTPS, somente o receptor temporário de callback fica público; dashboard e login continuam locais. A exigência de HTTPS foi confirmada pelo administrador; a aceitação do domínio gerado ainda deve ser concluída no cadastro.
