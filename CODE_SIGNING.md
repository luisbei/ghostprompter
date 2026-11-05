# Política de assinatura de código / Code signing policy

**Situação atual:** os instaladores do RecordPlease **ainda não são assinados digitalmente**. O projeto solicitou
assinatura gratuita para projetos open source à [SignPath Foundation](https://signpath.org). Esta página
será atualizada quando isso acontecer.

*Current status: RecordPlease installers are **not yet digitally signed**. The project has applied for free
open-source code signing from the [SignPath Foundation](https://signpath.org). This page will be updated then.*

Quando a assinatura estiver ativa / *Once signing is active*:

> Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
> [SignPath Foundation](https://signpath.org).

## Como os instaladores são produzidos / How installers are produced

- Todo instalador publicado é gerado pelo **GitHub Actions** deste repositório
  ([`.github/workflows/release.yml`](.github/workflows/release.yml)) a partir do commit da tag da versão — nunca
  enviado à mão.
- Cada versão traz o arquivo `SHA256SUMS.txt` com a "impressão digital" (SHA-256) do instalador, para conferência.
- *Every published installer is built by this repository's GitHub Actions workflow from the release tag's commit,
  never uploaded by hand. Each release includes `SHA256SUMS.txt` with the installer's SHA-256.*

## Papéis / Roles

| Papel / Role | Pessoa / Person |
|---|---|
| Autor e mantenedor (committer e revisor) / Author and maintainer (committer and reviewer) | [Luis Bei](https://github.com/luisbei) |
| Aprovação de cada versão assinada / Approver of each signed release | [Luis Bei](https://github.com/luisbei) |

Todas as contas com acesso ao repositório e à assinatura usam autenticação em duas etapas.
*All accounts with access to the repository and to signing use multi-factor authentication.*

O projeto assina somente os seus próprios arquivos (o instalador e o executável do RecordPlease).
*The project signs only its own files (the RecordPlease installer and executable).*

## Privacidade / Privacy

Este programa não transfere nenhuma informação para outros sistemas em rede, exceto quando o usuário pede
explicitamente: o download dos modelos de reconhecimento de voz em alphacephei.com. Detalhes em
[PRIVACY.md](PRIVACY.md).

*This program will not transfer any information to other networked systems unless specifically requested by the
user: downloading speech-recognition models from alphacephei.com. Details in [PRIVACY.md](PRIVACY.md).*
