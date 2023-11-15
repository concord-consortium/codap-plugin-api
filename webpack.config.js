'use strict';

module.exports = (env, argv) => {
  return {
    context: __dirname, // to automatically find tsconfig.json
    devtool: devMode ? 'eval-cheap-module-source-map' : 'source-map',
    entry: './src/codap-plugin-api.tsx',
    mode: 'development',
    output: {
      filename: 'codap-plugin-api.js',
      library: 'CODAPPlugin',
      libraryTarget: 'umd',
    },
    performance: { hints: false },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
        }
      ]
    },
    resolve: {
      extensions: [ '.ts', '.tsx', '.js' ],
    },
    stats: {
      // suppress "export not found" warnings about re-exported types
      warningsFilter: /export .* was not found in/,
    },
    plugins: [],
    externals: {
      'react': 'react',
      'react-dom': 'ReactDOM'
    }
  };
};
