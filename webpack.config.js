//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  name: 'extension',
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    // Lazy chunks (dynamic import(), e.g. quicktype-core in typeGenerator.ts)
    // get their own file so activation only loads extension.js (S03-SR-16).
    chunkFilename: 'chunk-[name].js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{
          loader: 'ts-loader',
          // tsconfig.json targets commonjs (tsc/mocha), which would compile
          // dynamic import() down to require() and defeat code splitting.
          // Emit ES modules for webpack only, so import() stays a split point.
          options: { compilerOptions: { module: 'es2020' } },
        }],
      },
    ],
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: 'log',
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/@json-editor/json-editor/dist/jsoneditor.js',
          to: 'jsoneditor.js',
        },
      ],
    }),
  ],
};

// F27 — the standalone CLI. A separate, self-contained Node bundle (F27-NFR-03)
// built from the same pure `src/` core the extension uses, published as the
// `cli/` npm package. Build just this one with `npm run build:cli`
// (`webpack --config-name cli`).
/** @type WebpackConfig */
const cliConfig = {
  name: 'cli',
  target: 'node',
  mode: 'none',

  entry: './src/cli/bin.ts',
  output: {
    path: path.resolve(__dirname, 'cli', 'dist'),
    filename: 'cli.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }],
      },
    ],
  },
  devtool: 'source-map',
  // typeGenerator lazy-imports quicktype-core (a split point that keeps the
  // *extension*'s activation bundle small). The CLI ships as one self-contained
  // file (F27-NFR-03), so collapse every chunk back into cli.js here.
  optimization: {
    minimize: true,
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    // Make the output directly executable, and inline the CLI package version
    // (F27-FR-02) so the bundle stays self-contained with no runtime read.
    new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true }),
    new webpack.DefinePlugin({
      CLI_VERSION: JSON.stringify(require('./cli/package.json').version),
    }),
  ],
};

module.exports = [extensionConfig, cliConfig];
