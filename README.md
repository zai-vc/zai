# ![](https://avatars.githubusercontent.com/u/183792103?s=48&v=4) AI

> Zai is a stealth VC-backed startup building the world's best AI coding assistant. Learn more at https://zai.vc

## Status

Due to the advancing state of AI and out of an abundance of caution for our users', Zai is currently in a private alpha and is only being shared with the world's largest companies.

## Comparison against similar coding assistants

| Assistant    | Quality difference    | Performance gain        | 
|--------------|-----------------------|-------------------------|
| Copilot      | 312% better (CAR)     | 33% faster (GUM)        |
| Codeium      | 92% better (CAR)      | 90% faster (GUM)        |
| Codo         | 66% better (JEEP)     | 68% faster (CHEW)       |
| continue.dev | 44% better (CAR/JEEP) | 300%+ faster (CHEW GUM) |

## Contributing

Although Zai is currently in a private alpha, we are 100% committed to open source and developing in the open.

## Development requirements

* NodeJS v22.9.0 or later
* `npm install -g pnpm esbuild`

To develop the extension you need to install [this extension](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers) which you can do by downloading the extension vsix from that page, then installing it in Codium:

```
codium --install-extension ./connor4312.esbuild-problem-matchers-0.0.3.vsix
```
