# Privacidade / Privacy

**Resumo:** o Ghostprompter não envia nada para fora do seu computador. Gravações de tela, câmera e microfone,
roteiros e configurações ficam só no seu disco. O único acesso à internet que o app faz é baixar os modelos de
reconhecimento de voz, e apenas quando você clica em "Baixar modelo".

*Summary: Ghostprompter never sends anything off your computer. Screen, camera and microphone recordings, scripts
and settings stay on your disk. The only internet access the app makes is downloading speech-recognition models,
and only when you click "Download model".*

O Ghostprompter **não se conecta a fontes externas**: não busca conteúdo na internet, não usa inteligência
artificial, chatbots, assistentes, MCP ou serviços on-line, não recebe texto em tempo real e não pode ser controlado
de fora. Ele só mostra o roteiro que você mesmo abriu. Veja também *Propósito e uso responsável* no
[README](README.md).

## O que fica no seu computador

| Dado | Onde fica |
|---|---|
| Gravações (tela, câmera, áudio) | Pasta escolhida no painel (padrão: `Vídeos\Ghostprompter`) |
| Configurações | `%LOCALAPPDATA%\Ghostprompter\settings.json` |
| Modelos de voz baixados | `%LOCALAPPDATA%\Ghostprompter\models` |
| Último roteiro aberto (só se "Lembrar o último roteiro" estiver ligado) | Armazenamento interno do app em `%LOCALAPPDATA%\Ghostprompter` — o botão "Limpar roteiro salvo" apaga |

Os dados do app ficam em `%LOCALAPPDATA%` (pasta *Local*), que, ao contrário de `%APPDATA%` (*Roaming*), não é
sincronizada com servidores em computadores de empresa.

A voz é processada **no seu computador** (reconhecimento offline com Vosk). Nada de áudio, texto ou vídeo vai para
servidor nenhum. O app não tem conta, login, telemetria, estatísticas de uso, relatório de erros nem atualização
automática.

**Câmera e microfone** só são ligados quando estão ativados no painel: o microfone fica aberto enquanto "Gravar
microfone" estiver marcado (para o medidor de nível) e, nos modos de rolagem por voz, enquanto o prompter estiver
visível. O Windows mostra o ícone de microfone/câmera em uso na barra de tarefas.

Além dos itens da tabela, o app guarda no seu computador caches técnicos do Chromium (na mesma pasta
`%LOCALAPPDATA%\Ghostprompter`) e uma cópia de trabalho do modelo de voz já carregado. Nada disso sai do
computador.

**Desinstalar não apaga** gravações nem configurações. Para apagar tudo o que o app guardou, exclua a pasta
`%LOCALAPPDATA%\Ghostprompter` (e, se existir, a antiga `%APPDATA%\gravador-teleprompter`). As gravações ficam na
pasta que você escolheu no painel.

Depois que um arquivo é salvo, ele é seu: o que você fizer com ele fora do app (enviar, publicar etc.) não passa
pelo Ghostprompter.

## Atenção: pastas sincronizadas com a nuvem

Se a pasta de gravações estiver dentro do OneDrive, Dropbox, Google Drive ou similar, **o programa de sincronização**
(não o Ghostprompter) vai enviar as gravações para a internet. Em muitos Windows a pasta *Vídeos* faz parte do
backup do OneDrive. Por isso:

- o painel mostra um aviso quando a pasta escolhida é sincronizada;
- se a pasta *Vídeos* estiver na nuvem, o padrão passa a ser uma pasta local (`%USERPROFILE%\Ghostprompter`).

## Como isso é garantido no código

Não é só "o app não tem função de envio": a rede é **travada** no próprio código (`app.js`, seção
*PRIVACIDADE: NADA SAI DO COMPUTADOR*):

1. **Processo principal** — `fetch`, `http`, `https`, `http2`, `net`, `tls` e o `net` do Electron só aceitam
   conexões HTTPS para uma lista fixa (`ALLOWED_HOSTS`), que hoje contém apenas `alphacephei.com` (site oficial dos
   modelos Vosk). Redirecionamentos são recusados e UDP (`dgram`) é proibido.
2. **Janelas do app** — toda requisição que não seja local é cancelada antes de sair: só passam os arquivos do
   próprio app, os modelos já baixados e o vídeo da câmera/tela. Endereços `file://servidor/...` (que no Windows
   virariam acesso de rede) também são bloqueados.
3. **Chromium** — serviços de fundo que poderiam acessar a internet (corretor ortográfico, atualização de
   componentes, descoberta de Chromecast na rede local etc.) são desligados, e o WebRTC não pode usar UDP direto.
4. **Programas externos** — o app só executa dois programas do próprio Windows, por caminho absoluto:
   `tar.exe` (para desempacotar um modelo de voz baixado) e `net.exe use` (só para listar quais unidades deste
   computador são de rede, e assim recusá-las como pasta de gravação). Os vídeos são gravados direto em MP4 pelo
   próprio app, sem programa de conversão.
5. **Pastas de rede** — gravar em `\\servidor\pasta` ou numa unidade de rede mapeada faria os vídeos atravessarem
   a rede; por isso essas pastas são recusadas.
6. **Modelos de voz** têm a "impressão digital" (SHA-256) conferida; um arquivo diferente do original é descartado.

Essas travas cobrem todo o código JavaScript do app e das bibliotecas que ele carrega. Elas não substituem um
firewall: um programa nativo malicioso no seu computador poderia contornar qualquer aplicativo. Se você quer uma
garantia no nível do Windows, use a regra de firewall abaixo.

## Como verificar você mesmo

- Leia a seção de privacidade no início de `app.js`.
- Com o app aberto e gravando, rode no PowerShell:
  ```powershell
  $ids = (Get-Process Ghostprompter).Id
  Get-NetTCPConnection -OwningProcess $ids -ErrorAction SilentlyContinue | Where-Object RemoteAddress -notin '0.0.0.0','::','127.0.0.1','::1'
  ```
  Não deve aparecer nenhuma conexão (só durante um download de modelo que você pediu).
- **Garantia pelo Windows (opcional):** bloqueie o app no firewall. Tudo continua funcionando, exceto o download de
  modelos de voz (baixe os idiomas antes, ou desative a regra só na hora de baixar). PowerShell como administrador:
  ```powershell
  New-NetFirewallRule -DisplayName "Ghostprompter - sem internet" -Direction Outbound -Action Block `
    -Program "$env:LOCALAPPDATA\Programs\Ghostprompter\Ghostprompter.exe"
  ```

## Bibliotecas de terceiros

- **Electron / Chromium** — com os serviços de rede de fundo desligados, como descrito acima.
- **vosk-browser** — reconhecimento de voz em WebAssembly, roda dentro do app.
