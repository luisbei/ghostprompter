# Privacy

**English** · [Português](#privacidade) · [Español](#privacidad)

**Summary:** RecordPlease does not send anything off your computer. Screen, camera and microphone recordings,
scripts and settings stay on your disk. The only internet access the app makes is downloading speech-recognition
models, and only when you click "Download model".

RecordPlease **does not connect to external sources**: no internet content, no artificial intelligence, chatbots,
assistants, MCP or online services, no real-time text feed, and it cannot be controlled remotely. It only shows the
script you opened yourself. See also *Purpose and responsible use* in the [README](README.md).

## What stays on your computer

| Data | Where |
|---|---|
| Recordings (screen, camera, audio) | Folder chosen in the panel (default: `Videos\RecordPlease`) |
| Settings | `%LOCALAPPDATA%\RecordPlease\settings.json` |
| Downloaded speech models | `%LOCALAPPDATA%\RecordPlease\models` |
| Last opened script (only if "Remember the last script" is on) | App's internal storage in `%LOCALAPPDATA%\RecordPlease` — the "Clear saved script" button deletes it |

App data lives in `%LOCALAPPDATA%` (the *Local* folder), which, unlike `%APPDATA%` (*Roaming*), is not synced to
servers on company computers.

Speech is processed **on your computer** (offline recognition with Vosk). No audio, text or video goes to any
server. The app has no account, login, telemetry, usage statistics, crash reporting or automatic updates.

**Camera and microphone** are only turned on when enabled in the panel: the microphone stays open while "Record
microphone" is ticked (for the level meter) and, in the voice-scrolling modes, while the prompter is visible. Windows
shows the microphone/camera in-use icon in the taskbar.

Besides the items in the table, the app keeps Chromium technical caches (in the same `%LOCALAPPDATA%\RecordPlease`
folder) and a working copy of the loaded speech model on your computer. None of this leaves the computer.

**Uninstalling does not delete** recordings or settings. To delete everything the app stored, remove the
`%LOCALAPPDATA%\RecordPlease` folder (and, if they exist, the old `%LOCALAPPDATA%\Ghostprompter` and `%APPDATA%\gravador-teleprompter`). Recordings are in
the folder you chose in the panel.

Once a file is saved, it is yours: whatever you do with it outside the app (send, publish, etc.) does not go through
RecordPlease.

## Warning: cloud-synced folders

If the recordings folder is inside OneDrive, Dropbox, Google Drive or similar, **the sync program** (not
RecordPlease) will upload the recordings to the internet. On many Windows computers the *Videos* folder is part of
the OneDrive backup. That is why:

- the panel shows a warning when the chosen folder is synced;
- if the *Videos* folder is in the cloud, the default becomes a local folder (`%USERPROFILE%\RecordPlease`).

## How this is enforced in the code

It is not just "the app has no upload feature": the network is **locked** in the code itself (`app.js`, section
*PRIVACIDADE: NADA SAI DO COMPUTADOR*):

1. **Main process** — `fetch`, `http`, `https`, `http2`, `net`, `tls` and Electron's `net` only accept HTTPS
   connections to a fixed list (`ALLOWED_HOSTS`), which currently contains only `alphacephei.com` (the official Vosk
   models site). Redirects are refused and UDP (`dgram`) is forbidden.
2. **App windows** — every request that is not local is cancelled before it leaves: only the app's own files,
   already-downloaded models and the camera/screen video pass. `file://server/...` addresses (which on Windows would
   become network access) are blocked too.
3. **Chromium** — background services that could reach the internet (spell checker, component updates, Chromecast
   discovery on the local network, mDNS, etc.) are turned off, and **WebRTC is removed** from the app's pages.
4. **External programs** — the app only runs two Windows programs, by absolute path: `tar.exe` (to unpack a
   downloaded speech model) and `net.exe use` (only to list which drives on this computer are network drives, so they
   can be refused as recording folders). Videos are recorded directly as MP4 by the app itself, with no converter.
5. **Network folders** — recording to `\\server\folder` or to a mapped network drive would send the videos over the
   network, so these folders are refused.
6. **Speech models** have their "fingerprint" (SHA-256) checked; a file that differs from the original is discarded.

These locks cover all JavaScript code of the app and of the libraries it loads. They do not replace a firewall: a
malicious native program on your computer could get around any application. If you want a guarantee at the Windows
level, use the firewall rule below.

## How to check it yourself

- Read the privacy section at the beginning of `app.js`.
- With the app open and recording, run in PowerShell:
  ```powershell
  $ids = (Get-Process RecordPlease).Id
  Get-NetTCPConnection -OwningProcess $ids -ErrorAction SilentlyContinue | Where-Object RemoteAddress -notin '0.0.0.0','::','127.0.0.1','::1'
  ```
  No connection should show up (only during a model download you asked for).
- **Windows-level guarantee (optional):** block the app in the firewall. Everything keeps working except downloading
  speech models (download the languages first, or disable the rule only while downloading). PowerShell as
  administrator:
  ```powershell
  New-NetFirewallRule -DisplayName "RecordPlease - no internet" -Direction Outbound -Action Block `
    -Program "$env:LOCALAPPDATA\Programs\RecordPlease\RecordPlease.exe"
  ```
  If you updated from Ghostprompter, the app stays in the previous folder:
  `$env:LOCALAPPDATA\Programs\Ghostprompter\RecordPlease.exe`.

## Third-party libraries

- **Electron / Chromium** — with background network services turned off, as described above.
- **vosk-browser** — speech recognition in WebAssembly, runs inside the app.

Licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Privacidade

**Resumo:** o RecordPlease não envia nada para fora do seu computador. Gravações de tela, câmera e microfone,
roteiros e configurações ficam só no seu disco. O único acesso à internet que o app faz é baixar os modelos de
reconhecimento de voz, e apenas quando você clica em "Baixar modelo".

O RecordPlease **não se conecta a fontes externas**: não busca conteúdo na internet, não usa inteligência
artificial, chatbots, assistentes, MCP ou serviços on-line, não recebe texto em tempo real e não pode ser controlado
de fora. Ele só mostra o roteiro que você mesmo abriu. Veja também *Propósito e uso responsável* no
[README](README.md#português).

### O que fica no seu computador

| Dado | Onde fica |
|---|---|
| Gravações (tela, câmera, áudio) | Pasta escolhida no painel (padrão: `Vídeos\RecordPlease`) |
| Configurações | `%LOCALAPPDATA%\RecordPlease\settings.json` |
| Modelos de voz baixados | `%LOCALAPPDATA%\RecordPlease\models` |
| Último roteiro aberto (só se "Lembrar o último roteiro" estiver ligado) | Armazenamento interno do app em `%LOCALAPPDATA%\RecordPlease` — o botão "Limpar roteiro salvo" apaga |

Os dados do app ficam em `%LOCALAPPDATA%` (pasta *Local*), que, ao contrário de `%APPDATA%` (*Roaming*), não é
sincronizada com servidores em computadores de empresa.

A voz é processada **no seu computador** (reconhecimento offline com Vosk). Nada de áudio, texto ou vídeo vai para
servidor nenhum. O app não tem conta, login, telemetria, estatísticas de uso, relatório de erros nem atualização
automática.

**Câmera e microfone** só são ligados quando estão ativados no painel: o microfone fica aberto enquanto "Gravar
microfone" estiver marcado (para o medidor de nível) e, nos modos de rolagem por voz, enquanto o prompter estiver
visível. O Windows mostra o ícone de microfone/câmera em uso na barra de tarefas.

Além dos itens da tabela, o app guarda no seu computador caches técnicos do Chromium (na mesma pasta
`%LOCALAPPDATA%\RecordPlease`) e uma cópia de trabalho do modelo de voz já carregado. Nada disso sai do computador.

**Desinstalar não apaga** gravações nem configurações. Para apagar tudo o que o app guardou, exclua a pasta
`%LOCALAPPDATA%\RecordPlease` (e, se existirem, as antigas `%LOCALAPPDATA%\Ghostprompter` e `%APPDATA%\gravador-teleprompter`). As gravações ficam na pasta
que você escolheu no painel.

Depois que um arquivo é salvo, ele é seu: o que você fizer com ele fora do app (enviar, publicar etc.) não passa
pelo RecordPlease.

### Atenção: pastas sincronizadas com a nuvem

Se a pasta de gravações estiver dentro do OneDrive, Dropbox, Google Drive ou similar, **o programa de sincronização**
(não o RecordPlease) vai enviar as gravações para a internet. Em muitos Windows a pasta *Vídeos* faz parte do backup
do OneDrive. Por isso:

- o painel mostra um aviso quando a pasta escolhida é sincronizada;
- se a pasta *Vídeos* estiver na nuvem, o padrão passa a ser uma pasta local (`%USERPROFILE%\RecordPlease`).

### Como isso é garantido no código

Não é só "o app não tem função de envio": a rede é **travada** no próprio código (`app.js`, seção
*PRIVACIDADE: NADA SAI DO COMPUTADOR*):

1. **Processo principal** — `fetch`, `http`, `https`, `http2`, `net`, `tls` e o `net` do Electron só aceitam
   conexões HTTPS para uma lista fixa (`ALLOWED_HOSTS`), que hoje contém apenas `alphacephei.com` (site oficial dos
   modelos Vosk). Redirecionamentos são recusados e UDP (`dgram`) é proibido.
2. **Janelas do app** — toda requisição que não seja local é cancelada antes de sair: só passam os arquivos do
   próprio app, os modelos já baixados e o vídeo da câmera/tela. Endereços `file://servidor/...` (que no Windows
   virariam acesso de rede) também são bloqueados.
3. **Chromium** — serviços de fundo que poderiam acessar a internet (corretor ortográfico, atualização de
   componentes, descoberta de Chromecast na rede local, mDNS etc.) são desligados, e o **WebRTC é removido** das
   páginas do app.
4. **Programas externos** — o app só executa dois programas do próprio Windows, por caminho absoluto: `tar.exe`
   (para desempacotar um modelo de voz baixado) e `net.exe use` (só para listar quais unidades deste computador são
   de rede, e assim recusá-las como pasta de gravação). Os vídeos são gravados direto em MP4 pelo próprio app, sem
   programa de conversão.
5. **Pastas de rede** — gravar em `\\servidor\pasta` ou numa unidade de rede mapeada faria os vídeos atravessarem a
   rede; por isso essas pastas são recusadas.
6. **Modelos de voz** têm a "impressão digital" (SHA-256) conferida; um arquivo diferente do original é descartado.

Essas travas cobrem todo o código JavaScript do app e das bibliotecas que ele carrega. Elas não substituem um
firewall: um programa nativo malicioso no seu computador poderia contornar qualquer aplicativo. Se você quer uma
garantia no nível do Windows, use a regra de firewall da seção em inglês acima (*How to check it yourself*).

### Como verificar você mesmo

- Leia a seção de privacidade no início de `app.js`.
- Com o app aberto e gravando, rode no PowerShell o comando `Get-NetTCPConnection` da seção em inglês acima: não deve
  aparecer nenhuma conexão (só durante um download de modelo que você pediu).
- **Garantia pelo Windows (opcional):** bloqueie o app no firewall com o comando `New-NetFirewallRule` da seção em
  inglês (PowerShell como administrador). Tudo continua funcionando, exceto o download de modelos de voz (baixe os
  idiomas antes, ou desative a regra só na hora de baixar).

---

## Privacidad

**Resumen:** RecordPlease no envía nada fuera de tu computadora. Las grabaciones de pantalla, cámara y micrófono,
los guiones y la configuración se quedan en tu disco. El único acceso a internet que hace la app es descargar los
modelos de reconocimiento de voz, y solo cuando haces clic en "Descargar modelo".

RecordPlease **no se conecta a fuentes externas**: no busca contenido en internet, no usa inteligencia artificial,
chatbots, asistentes, MCP ni servicios en línea, no recibe texto en tiempo real y no puede controlarse desde fuera.
Solo muestra el guion que tú abriste.

- Los datos de la app están en `%LOCALAPPDATA%\RecordPlease`; las grabaciones, en la carpeta que elegiste. Desinstalar
  no los borra: para borrarlo todo, elimina esa carpeta (y, si existen, las antiguas `%LOCALAPPDATA%\Ghostprompter` y
  `%APPDATA%\gravador-teleprompter`).
- La voz se procesa **en tu computadora** (Vosk, sin conexión). Sin cuenta, telemetría ni actualizaciones automáticas.
- Si la carpeta de grabaciones está en OneDrive, Dropbox o similar, **ese programa** subirá las grabaciones a
  internet; el panel muestra un aviso. Las carpetas de red se rechazan.
- La red está **bloqueada en el propio código** (detalles en la sección en inglés, *How this is enforced in the
  code*), y puedes comprobarlo tú mismo con los comandos de *How to check it yourself*.
