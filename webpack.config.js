//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
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
module.exports = [extensionConfig];
