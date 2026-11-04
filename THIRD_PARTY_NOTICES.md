# Avisos de terceiros / Third-party notices

O Ghostprompter é distribuído sob a licença MIT (veja `LICENSE`). O instalador inclui os componentes abaixo, cada
um sob a sua própria licença.

*Ghostprompter is distributed under the MIT License (see `LICENSE`). The installer includes the components below,
each under its own license.*

| Componente | Uso no app | Licença | Onde está o texto da licença |
|---|---|---|---|
| [Electron](https://www.electronjs.org) | Base do aplicativo (janelas, gravação) | MIT | `LICENSE.electron.txt` (na pasta do app instalado) |
| [Chromium](https://www.chromium.org) e suas bibliotecas (via Electron) | Motor das janelas e do gravador de vídeo (MP4/H.264, AAC) | BSD-3-Clause e outras | `LICENSES.chromium.html` (na pasta do app instalado) |
| [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8 | Reconhecimento de voz offline (WebAssembly) | Apache-2.0 | <https://www.apache.org/licenses/LICENSE-2.0> |
| [Vosk](https://github.com/alphacep/vosk-api), [Kaldi](https://github.com/kaldi-asr/kaldi), [OpenFst](https://www.openfst.org) (dentro do vosk-browser) | Reconhecimento de voz | Apache-2.0 | <https://www.apache.org/licenses/LICENSE-2.0> |
| Bibliotecas auxiliares embutidas no vosk-browser (ex.: md5 de Sebastian Tschan / Paul Johnston, tslib) | Funções internas do reconhecedor | MIT, BSD, 0BSD | Avisos dentro de `node_modules/vosk-browser/dist/vosk.js` |
| [uuid](https://github.com/uuidjs/uuid) 9.0.0 (dependência do vosk-browser) | Identificadores internos | MIT | `node_modules/uuid/LICENSE.md` |

## Modelos de voz (não incluídos no instalador)

Os modelos de reconhecimento de voz **não vêm no instalador**. Quando você clica em "Baixar modelo", o app baixa do
site oficial do Vosk (alphacephei.com) os modelos abaixo, distribuídos pelos seus autores sob **Apache-2.0**:

- `vosk-model-small-pt-0.3` (Português)
- `vosk-model-small-es-0.42` (Español)
- `vosk-model-small-en-us-0.15` (English, US)

Lista oficial: <https://alphacephei.com/vosk/models>

## Ferramentas de desenvolvimento (não distribuídas)

`electron-builder` (MIT) é usado só para gerar o instalador e não faz parte do app instalado.
