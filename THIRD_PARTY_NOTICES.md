# Third-party notices

**English** · [Português](#avisos-de-terceiros) · [Español](#avisos-de-terceros)

Ghostprompter is distributed under the MIT License (see [LICENSE](LICENSE)). The installer includes the components
below, each under its own license.

| Component | Used for | License | License text |
|---|---|---|---|
| [Electron](https://www.electronjs.org) | Application framework (windows, recording) | MIT | `LICENSE.electron.txt` (in the installed app folder) |
| [Chromium](https://www.chromium.org) and its libraries (via Electron) | Window engine and video recorder (MP4/H.264, AAC) | BSD-3-Clause and others | `LICENSES.chromium.html` (in the installed app folder) |
| [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8 | Offline speech recognition (WebAssembly) | Apache-2.0 | <https://www.apache.org/licenses/LICENSE-2.0> |
| [Vosk](https://github.com/alphacep/vosk-api), [Kaldi](https://github.com/kaldi-asr/kaldi), [OpenFst](https://www.openfst.org) (inside vosk-browser) | Speech recognition | Apache-2.0 | <https://www.apache.org/licenses/LICENSE-2.0> |
| Helper libraries bundled in vosk-browser (e.g. md5 by Sebastian Tschan / Paul Johnston, tslib) | Internal recognizer functions | MIT, BSD, 0BSD | Notices inside `node_modules/vosk-browser/dist/vosk.js` |
| [uuid](https://github.com/uuidjs/uuid) 9.0.0 (vosk-browser dependency) | Internal identifiers | MIT | `node_modules/uuid/LICENSE.md` |

## Speech models (not included in the installer)

Speech-recognition models **are not shipped with the installer**. When you click "Download model", the app downloads
the models below from the official Vosk website (alphacephei.com); their authors distribute them under
**Apache-2.0**:

- `vosk-model-small-pt-0.3` (Portuguese)
- `vosk-model-small-es-0.42` (Spanish)
- `vosk-model-small-en-us-0.15` (English, US)

Official list: <https://alphacephei.com/vosk/models>

## Development tools (not distributed)

`electron-builder` (MIT) is only used to build the installer and is not part of the installed app.

---

## Avisos de terceiros

O Ghostprompter é distribuído sob a licença MIT (veja [LICENSE](LICENSE)). O instalador inclui os componentes da
tabela acima, cada um sob a sua própria licença: Electron (MIT), Chromium (BSD-3-Clause e outras), vosk-browser,
Vosk, Kaldi e OpenFst (Apache-2.0), bibliotecas auxiliares do vosk-browser (MIT, BSD, 0BSD) e uuid (MIT).

Os **modelos de voz não vêm no instalador**: quando você clica em "Baixar modelo", o app baixa do site oficial do
Vosk (alphacephei.com) os modelos listados acima, distribuídos pelos autores sob **Apache-2.0**. O `electron-builder`
(MIT) só é usado para gerar o instalador e não faz parte do app instalado.

## Avisos de terceros

Ghostprompter se distribuye bajo la licencia MIT (ver [LICENSE](LICENSE)). El instalador incluye los componentes de
la tabla de arriba, cada uno con su propia licencia: Electron (MIT), Chromium (BSD-3-Clause y otras), vosk-browser,
Vosk, Kaldi y OpenFst (Apache-2.0), bibliotecas auxiliares de vosk-browser (MIT, BSD, 0BSD) y uuid (MIT).

Los **modelos de voz no vienen en el instalador**: al hacer clic en "Descargar modelo", la app descarga del sitio
oficial de Vosk (alphacephei.com) los modelos indicados arriba, distribuidos por sus autores bajo **Apache-2.0**.
`electron-builder` (MIT) solo se usa para generar el instalador y no forma parte de la app instalada.
