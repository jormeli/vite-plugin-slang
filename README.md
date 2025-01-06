# vite-plugin-slang

Vite plugin to load and automatically compile [Slang](https://github.com/shader-slang/slang) shaders into WGSL/GLSL so they can be imported in your code as raw strings.
Uses the WASM build of Slang for compilation.

## Features

- Compiles Slang shader code to WGSL or GLSL
- Detects imports in Slang code and resolves them
- HMR support (also for imported modules)
- Provides compilation errors to the client

## Usage

```typescript
// yourFile.ts
import mySlangShader from './shaders/mySlangShader.slang?wgsl' // imports the shader as a WGSL string
import myOtherShader from './shaders/myOtherShader.slang?glsl' // imports the shader as a GLSL string
```

## Install

```
npm install --save-dev vite-plugin-slang
```

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import slang from 'vite-plugin-slang'

export default defineConfig({
  //...
  plugins: [slang()],
})
```
