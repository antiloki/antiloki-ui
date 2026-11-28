<p align="center"><img src="https://raw.githubusercontent.com/antiloki/antiloki-app/main/docs/readme/logo.png" alt="antiloki logo" width="96"></p>

# antiloki-ui

<p align="center">
  <a href="https://patreon.com/danjindev"><img src="https://img.shields.io/badge/Support%20on%20Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white" alt="Support on Patreon" height="44"></a>
  &nbsp;
  <a href="https://www.buymeacoffee.com/danjindev"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=danjindev&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="44"></a>
</p>
<p align="center"><sub>antiloki is free and open source. If it saves you time, helping us keep working on it means more fixes, a Windows build and faster releases.</sub></p>

The front end of **[antiloki](https://github.com/antiloki/antiloki-app)**, a vibe graphing IDE: you build the team that produces the result, not the result itself.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-antiloki.com-orange.svg)](https://antiloki.com/docs.html)

Free and open source under [Apache-2.0](LICENSE). Documentation: **<https://antiloki.com/docs.html>**.

React, TypeScript and Vite, with TanStack Router and CodeMirror 6. It talks to the antiloki backend (`antiloki-serve`, in the [core repo](https://github.com/antiloki/antiloki-app)) over HTTP on `127.0.0.1:41931`, and is bundled into the desktop app by the core repo's Tauri build.

## Run it

You need the backend running; see the [core README](https://github.com/antiloki/antiloki-app#build-from-source). Then:

```bash
npm ci
npm run dev          # http://localhost:5173
```

## Check it

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run build        # typecheck + production build into dist/
```

The desktop build expects this repo to sit **next to** the core repo (`../antiloki-ui`) and reads `dist/` from here.

## Where things are

```
src/routes/        the screens
src/loki/team/     teams: graph, editor, sequence, Evolve and Swarm panels
src/loki/cowork/   panes, terminals, the sidebar and the new-pane menu
src/loki/shell/    the window shell, the workspace gate
```

## Contributing

Read the core repo's [CONTRIBUTING.md](https://github.com/antiloki/antiloki-app/blob/main/CONTRIBUTING.md). Keep the UI flat and calm: no gradients, shadows or glows inside the product; check a change with a screenshot before you call it done.

## Support the project

antiloki is free and open source, built by a small team. If it saves you time, supporting it helps us keep working on it: more fixes, a Windows build, faster releases.

- **Patreon:** <https://patreon.com/danjindev>
- **Buy me a coffee:** <https://www.buymeacoffee.com/danjindev>
- Starring the repo, reporting a bug or sending a pull request also helps a lot.

## License

Apache-2.0. See [LICENSE](LICENSE).
