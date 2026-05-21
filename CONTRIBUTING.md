# Contributing

We love your input! We want to make contributing to this project as easy and transparent as possible.

## Summary of the contribution flow

```
    ┌───────────────────────┐
    │                       │
    │    Open an issue      │
    │  (a bug report or a   │
    │   feature request)    │
    │                       │
    └───────────────────────┘
               ⇩
    ┌───────────────────────┐
    │                       │
    │  Open a Pull Request  │
    │   (only after issue   │
    │     is approved)      │
    │                       │
    └───────────────────────┘
               ⇩
    ┌───────────────────────┐
    │                       │
    │   Your changes will   │
    │     be merged and     │
    │ published on the next │
    │        release        │
    │                       │
    └───────────────────────┘
```

## Code of Conduct

Please [read the full text](./CODE_OF_CONDUCT.md) so that you can understand what sort of behaviour is expected.

## Development

```bash
npm install
npm run compile    # single build
npm run watch      # watch mode
```

Press `F5` in VS Code to launch the Extension Development Host.

## Conventional commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary).
Pull request titles must follow the specification.

- `fix:` — bug fix, triggers a PATCH release
- `feat:` — new feature, triggers a MINOR release
- `docs:` — documentation only, no release
- `chore:` — cleanup, no release
- `refactor:` — refactoring, no release

Add `!` for a MAJOR release (e.g. `feat!:`).

## License

By contributing you agree that your submissions are under the same
[Apache 2.0 License](./LICENSE.md) that covers the project.
