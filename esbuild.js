const esbuild = require('esbuild');

async function build() {
  const isWatch = process.argv.includes('--watch');

  const extensionConfig = {
    entryPoints: ['src/extension/extension.ts'],
    bundle: true,
    platform: 'node',
    external: ['vscode'],
    outfile: 'dist/extension.js',
    sourcemap: true,
  };

  const webviewConfig = {
    entryPoints: ['src/webview/index.tsx'],
    bundle: true,
    platform: 'browser',
    outfile: 'dist/webview.js',
    sourcemap: true,
    minify: true, // Minify React to avoid big payloads
  };

  try {
    if (isWatch) {
      const extCtx = await esbuild.context(extensionConfig);
      const webCtx = await esbuild.context(webviewConfig);
      await extCtx.watch();
      await webCtx.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(extensionConfig);
      await esbuild.build(webviewConfig);
      console.log('Build complete');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

build();
