# Security policy / Política de segurança

## Reporting a vulnerability

If you find a security or privacy problem in Ghostprompter, **please do not open a public issue**. Report it
privately through GitHub:

**[Report a vulnerability](https://github.com/luisbei/ghostprompter/security/advisories/new)**
(repository → *Security* → *Report a vulnerability*)

Please include, if you can:
- what the problem is and why it matters (e.g. data leaving the computer, running code, reading or writing files it
  should not);
- steps to reproduce, the Ghostprompter version and your Windows version;
- whether it is already public anywhere.

This is a project maintained by one person in their free time: reports are answered on a best-effort basis, usually
within a few days. Confirmed issues are fixed in a new release and credited to the reporter in the release notes,
unless you prefer to stay anonymous.

## Supported versions

Only the **latest release** on the [Releases page](https://github.com/luisbei/ghostprompter/releases) receives fixes.
Please update before reporting.

## Scope

Especially relevant:
- anything that makes the app **send data off the computer** or connect to anything other than the user-requested
  speech-model download (see [PRIVACY.md](PRIVACY.md));
- the teleprompter or control window appearing in Ghostprompter's own recordings when protection is on;
- running code, reading or writing files outside the app's own folders and the chosen recordings folder;
- tampering with downloaded speech models or with the installer.

Out of scope: problems that require an attacker who already has full control of the user's computer, and other
programs' ability to capture protected windows (that depends on Windows and on those programs — see the README).

---

## Como relatar uma falha (português)

Encontrou um problema de segurança ou privacidade? **Não abra uma issue pública.** Relate em particular pelo GitHub:
**[Report a vulnerability](https://github.com/luisbei/ghostprompter/security/advisories/new)** (repositório →
*Security* → *Report a vulnerability*). Inclua o que acontece, como reproduzir e as versões do Ghostprompter e do
Windows. As respostas são feitas no melhor esforço, normalmente em poucos dias; só a versão mais recente recebe
correções.
