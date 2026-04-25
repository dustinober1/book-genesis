# Compatibility Notes

This repository originally shipped as a Claude-oriented skill bundle.

## Attribution

That original bundle came from **Book Genesis** by **Philip Stark**:

- Source: [https://gitlab.com/philipstark/book-genesis](https://gitlab.com/philipstark/book-genesis)
- Credit retained here because the PI-native package adapts upstream ideas and assets rather than replacing their origin

The PI-native package ignores the legacy runtime surface by manifest design:

- `skills/`
- `agents/`
- `knowledge/`
- `install.sh`
- `install.ps1`

Those files remain here as source material and migration references while the PI-native package becomes the canonical runtime.
