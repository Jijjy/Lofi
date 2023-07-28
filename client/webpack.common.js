const fs = require('fs');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

function* enumerateAllFiles(path, rp = path) {
  if (fs.statSync(path).isDirectory())
    for (f of fs.readdirSync(path))
      yield* enumerateAllFiles(rp + '/' + f);
  else
    yield path;
}

const jsonContent = JSON.stringify([...enumerateAllFiles('assets')].map(f => f.substring(7)), null, 2);
fs.writeFileSync('assets/asset-listing.json', jsonContent);

module.exports = {
  entry: ['./src/index.ts'],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({ template: 'src/index.html' }),
    new CopyWebpackPlugin({ patterns: [{ from: 'assets' }] })
  ],
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  }
};
