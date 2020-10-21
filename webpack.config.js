'use strict';

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const devMode = argv.mode !== 'production';

  return {
    context: __dirname, // to automatically find tsconfig.json
    devtool: 'source-map',
    entry: './src/index.tsx',
    mode: 'development',
    output: {
      filename: 'assets/index.[fullhash].js'
    },
    performance: { hints: false },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          enforce: 'pre',
          use: [
            {
              loader: 'eslint-loader',
              options: {}
            }
          ]
        },
        {
          test: /\.tsx?$/,
          loader: 'ts-loader'
        },
        {
          test: /\.(sa|sc|le|c)ss$/i,
          use: [
            devMode ? 'style-loader' : MiniCssExtractPlugin.loader,
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: {
                  // required for :import from scss files
                  // cf. https://github.com/webpack-contrib/css-loader#separating-interoperable-css-only-and-css-module-features
                  compileType: 'icss'
                }
              }
            },
            'postcss-loader',
            'sass-loader'
          ]
        },
        {
          test: /\.(png|woff|woff2|eot|ttf)$/,
          type: 'asset'
        },
        {
          test: /\.svg$/,
          oneOf: [
            {
              // Do not apply SVGR import in CSS files.
              issuer: /\.(css|scss|less)$/,
              type: 'asset'
            },
            {
              issuer: /\.tsx?$/,
              loader: '@svgr/webpack'
            }
          ]
        }
      ]
    },
    resolve: {
      extensions: [ '.ts', '.tsx', '.js' ]
    },
    stats: {
      // suppress "export not found" warnings about re-exported types
      warningsFilter: /export .* was not found in/
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: devMode ? "assets/[name].css" : "assets/[name].[contenthash].css"
      }),
      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: 'src/index.html'
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'src/public' },
        ],
      }),
    ]
  };
};
