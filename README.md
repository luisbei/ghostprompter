# Ghostprompter

*Teleprompter invisível que segue sua voz e grava sua tela.*

Grava **tela + webcam + microfone** e mostra um **teleprompter flutuante que fica de fora da gravação** (veja os limites em *Teleprompter fora da gravação*, abaixo).

## Propósito e uso responsável

**Para que serve:** gravar **aulas, apresentações e vídeos explicativos** com autonomia e qualidade — de graça,
sem conta, sem assinatura e sem complicação. O teleprompter fica escondido da gravação para que **quem assiste ao
seu vídeo** veja você falando com naturalidade, sem o roteiro na tela.

**Para que NÃO serve:** o Ghostprompter **não foi feito para burlar** processos seletivos, entrevistas, provas,
avaliações, bancas, sistemas de supervisão/monitoramento (*proctoring*) ou qualquer situação em que consultar um
texto escondido seja proibido ou engane alguém. Não use para isso.

**O que ele não faz:**
- **não se conecta a fontes externas**: não busca conteúdo na internet, não usa inteligência artificial, chatbots,
  assistentes, MCP ou qualquer serviço on-line, não recebe texto em tempo real e não pode ser controlado de fora;
- **só mostra o roteiro que você mesmo abriu** (um arquivo `.txt` ou `.md` do seu computador);
- **não envia nada** para fora do seu computador. O único acesso à internet é baixar os modelos de reconhecimento de
  voz, quando você pede (veja [PRIVACY.md](PRIVACY.md)).

**Sua responsabilidade:** use o app de acordo com a lei e com as regras do lugar onde você grava. Gravar outras
pessoas pode exigir o consentimento delas. O software é fornecido "no estado em que se encontra", sem garantias.

<details>
<summary><b>English</b> — Purpose and responsible use</summary>

**What it is for:** recording **lectures, presentations and explainer videos** on your own, with good quality — free,
no account, no subscription, no hassle. The teleprompter is hidden from the recording so that **the people watching
your video** see you speaking naturally, without the script on screen.

**What it is NOT for:** Ghostprompter **was not made to cheat** in job selection processes, interviews, exams,
assessments, thesis defenses, proctoring/monitoring systems or any situation where reading hidden text is forbidden
or deceives someone. Do not use it for that.

**What it does not do:** it **does not connect to external sources** — no internet content, no artificial
intelligence, chatbots, assistants, MCP or any online service, no real-time text feed, no remote control. It **only
shows the script you opened yourself** (a local `.txt` or `.md` file) and **sends nothing** off your computer; the
only internet access is downloading speech-recognition models when you ask (see [PRIVACY.md](PRIVACY.md)).

**Your responsibility:** use the app lawfully and according to the rules where you record. Recording other people
may require their consent. The software is provided "as is", without warranty.
</details>

<details>
<summary><b>Español</b> — Propósito y uso responsable</summary>

**Para qué sirve:** grabar **clases, presentaciones y videos explicativos** con autonomía y calidad — gratis, sin
cuenta, sin suscripción y sin complicaciones. El teleprompter queda oculto en la grabación para que **quienes ven tu
video** te vean hablar con naturalidad, sin el guion en pantalla.

**Para qué NO sirve:** Ghostprompter **no fue hecho para hacer trampa** en procesos de selección, entrevistas,
exámenes, evaluaciones, defensas de tesis, sistemas de supervisión (*proctoring*) ni en ninguna situación en la que
consultar un texto oculto esté prohibido o engañe a alguien. No lo uses para eso.

**Lo que no hace:** **no se conecta a fuentes externas** — no busca contenido en internet, no usa inteligencia
artificial, chatbots, asistentes, MCP ni ningún servicio en línea, no recibe texto en tiempo real y no puede
controlarse desde fuera. **Solo muestra el guion que tú abriste** (un archivo `.txt` o `.md` local) y **no envía
nada** fuera de tu computadora; el único acceso a internet es descargar los modelos de reconocimiento de voz cuando
lo pides (ver [PRIVACY.md](PRIVACY.md)).

**Tu responsabilidad:** usa la app de acuerdo con la ley y las reglas del lugar donde grabas. Grabar a otras personas
puede requerir su consentimiento. El software se ofrece "tal cual", sin garantías.
</details>

## Instalar (Windows)
Baixe o instalador **somente da página de versões (Releases) do projeto no GitHub**, confira o SHA-256 publicado
lá (`Get-FileHash <arquivo>` no PowerShell) e siga o assistente. Ele cria atalho no Menu Iniciar e na área de
trabalho e aparece em "Adicionar ou remover programas". Os modelos de voz são baixados pelo próprio app quando você
escolher "Seguir minha voz".

Como o instalador ainda não é assinado digitalmente, o Windows pode mostrar "O Windows protegeu o computador".
Depois de conferir a origem, clique em **Mais informações → Executar assim mesmo**. Se o antivírus bloquear, veja
o [`docs/LEIA-ME.txt`](docs/LEIA-ME.txt) (nunca crie exceções para pastas inteiras).

Ao desinstalar, gravações e configurações **não** são apagadas. Para apagar configurações e modelos de voz, exclua
`%LOCALAPPDATA%\Ghostprompter`.

Para gerar um instalador novo depois de mudar o código: `npm run dist` (sai em `release\`).
Para mudar a versão, altere `"version"` no `package.json`.

## Rodar sem instalar (desenvolvimento)
Dê dois cliques em **`Iniciar.bat`** (na primeira vez ele instala as dependências).
Ou, no terminal: `npm start`.

A versão instalada e a de desenvolvimento usam as mesmas configurações e modelos de voz
(`%LOCALAPPDATA%\Ghostprompter`; quem usava a versão 1.1 tem os dados movidos de `%APPDATA%\gravador-teleprompter`
na primeira abertura — se não der, o painel avisa).

## Uso
1. **Tela**: escolha a tela (ou janela) a gravar. Marque "áudio do sistema" se quiser o som do PC junto.
2. **Câmera / Microfone**: escolha os dispositivos. A barrinha mostra o nível do microfone.
   Em **Modo** da câmera:
   - *Arquivo separado* — grava `camera.mp4` à parte (melhor para editar depois).
   - *Janela na tela* — mostra uma janela flutuante da webcam (círculo ou retângulo) por cima da tela;
     ela **sai no vídeo da tela**. Arraste para mover; puxe o canto ou use a roda do mouse para redimensionar.
   - *Os dois* — janela na tela e também o arquivo separado.
3. **Teleprompter**: clique em *Abrir roteiro* ou **arraste um `.txt`/`.md`** para a janela preta.
   - Arraste pela barra de cima (aparece ao passar o mouse) e redimensione pelas bordas — deixe perto da webcam.
   - A posição e o tamanho ficam salvos.
4. **● Gravar**. Com a contagem regressiva ligada, o prompter mostra 3‑2‑1 e começa a rolar sozinho.

### Teleprompter fora da gravação: como funciona e limites
O teleprompter (e, se marcado, a janela de controle) usa a proteção de captura do Windows
(`WDA_EXCLUDEFROMCAPTURE`, Windows 10 versão 2004 ou mais novo). Você vê o texto na tela, mas ele fica de fora da
gravação do Ghostprompter e, em geral, de outros programas de gravação e compartilhamento que respeitam essa proteção.

**Não é uma garantia universal:** depende do Windows e do método de captura de cada programa, e não esconde nada de
uma câmera ou celular apontado para a tela nem de capturas externas do sinal de vídeo. **Faça uma gravação de teste**
antes de usar para valer. (Lembre-se: o propósito é gravar aulas e apresentações — veja *Propósito e uso responsável*.)

## Arquivos gerados
Por padrão em `Vídeos\Ghostprompter\Gravacao <data>\` (quem já usava a versão antiga continua em
`Vídeos\Gravacoes Teleprompter`). Os nomes seguem o idioma da interface
(ex.: `Recording …\screen.mp4` em inglês, `Grabacion …\pantalla.mp4` em espanhol):
- `tela.mp4` — tela + microfone (+ áudio do sistema, se marcado)
- `camera.mp4` — webcam + microfone (mesmo áudio, fácil de sincronizar na edição) — nos modos *Arquivo separado* e *Os dois*

## Idioma da interface
No seletor do topo do painel: **Automático** (segue o idioma do Windows; idiomas sem tradução usam inglês),
**Português**, **Español** ou **English**. A troca é na hora, sem reiniciar. As traduções ficam em `src/i18n.js`.

Os vídeos são gravados direto em **MP4 (H.264 + AAC)** pelo próprio app, sem programas externos. Só são aceitas
pastas deste computador (pastas de rede são recusadas), e o app avisa se a pasta for sincronizada com a nuvem.

## Teleprompter
| Ação | Na janela do prompter | Global (qualquer app em foco) |
|---|---|---|
| Rolar / pausar | Espaço | ver rodapé do painel |
| Velocidade | ↑ / ↓ | Ctrl+Alt+↑ / ↓ |
| Voltar ao início | Home | Ctrl+Alt+Home |
| Pular | PgUp / PgDn | Ctrl+Alt+PgUp / PgDn |
| Fonte | + / − ou Ctrl+roda | — |
| Espelhar | M | — |
| Gravar / parar | — | Ctrl+Alt+R |
| Mostrar / ocultar prompter | — | Ctrl+Alt+T |

Se algum atalho já estiver em uso por outro programa, o app usa uma alternativa — o rodapé do painel mostra os ativos.

## Rolagem por voz
No painel, em **Rolagem**:
- *Velocidade fixa* — rola na velocidade escolhida.
- *Pausar quando eu paro de falar* — rola na velocidade escolhida só enquanto você fala (qualquer idioma).
- *Seguir minha voz* — reconhece o que você fala e acompanha o texto palavra por palavra: acelera, desacelera,
  para e pula junto com você. Roda **offline** (Vosk). Idiomas: Português (BR), Español, English (US) —
  automático pelo roteiro ou escolhido no painel. Na primeira vez em cada idioma, clique em *Baixar modelo* (~30–40 MB).
  As palavras já lidas ficam esmaecidas. Se você rolar com a roda/atalhos, ele continua a partir dali.
  Cada modelo baixado tem o SHA-256 conferido contra o valor fixado em `app.js` (`MODELS`); se não bater,
  o arquivo é descartado e nada é instalado.

Com "Seguir minha voz", o bolinha no canto do prompter mostra o estado: verde = ouvindo você, amarelo = carregando.

## Deixas (não são lidas)
Textos entre `[colchetes]` ou `(parênteses)` viram deixas destacadas e **não precisam ser falados** —
o modo "Seguir minha voz" passa por cima delas. Ex.: `[PAUSA]`, `(próximo slide)`.
Os **títulos** do Markdown (`# ...`) também não precisam ser lidos.
Markdown suportado: títulos, **negrito**, *itálico*, listas, citações e `---`. Veja `exemplo-roteiro.md`.

## Licença
Código sob a **licença MIT** — veja [LICENSE](LICENSE). Copyright (c) 2026 Luis Bei.
Componentes de terceiros incluídos no instalador e suas licenças: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Privacidade: [PRIVACY.md](PRIVACY.md).

## Como citar
Se este software for útil no seu trabalho, cite-o (o GitHub mostra o botão *Cite this repository* a partir do
[CITATION.cff](CITATION.cff)):

> Bei, L. (2026). *Ghostprompter: teleprompter que segue a voz e grava tela, webcam e microfone para aulas e
> apresentações* (Versão 1.2.0) [Software]. ORCID: [0009-0002-4650-9948](https://orcid.org/0009-0002-4650-9948)

## Declaração de uso de IA / AI use statement
Este software foi criado com suporte de inteligência artificial. O próprio aplicativo **não usa IA nem nenhum
serviço on-line** — o reconhecimento de voz é feito no seu computador.

*This software was created with artificial-intelligence support. The application itself **does not use AI or any
online service** — speech recognition runs on your computer.*