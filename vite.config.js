import pathPk from 'path';
const path = pathPk;
import handlebars from 'vite-plugin-handlebars';
import checker from 'vite-plugin-checker';
import { fileURLToPath, URL } from 'url';

import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';

import { resolve } from 'path';


/*
This allows us to build a dist folder that lies
outside of the src folder. process.cwd() is a code
snippet that tells us what the absolute path is
for the project directory. For example, Fred Fathom
may have cloned the project from git into
  /Users/fred/projects/vite-template/
When Fred builds the project for production, the
final code will end up in
  /Users/fred/projects/vite-template/dist/
*/
const currentDir = process.cwd();
const distDir = currentDir + '/dist';


/*
This little bit of code resolves a problem we have had
with package builders in the past. The problem is
resolving paths to images, font, and other assets.
Let's take a minute to describe the problem, using an
example. Imagin your project files arranged like this

src/
├── index.html
├── style/
│   └── main.less
└── assets/
    ├── data/
    └── images/
        └── fathom.png

Now imagine the case where you want to set the background image
to 'fathom.png'. That syntax is like:
  background-image: url(/path/to/the/file)
In this case, from main.less, that path has to go up a
level (using '../' )before tracing back down to fathom.png:
  background-image: url(../assets/images/fathom.png)

When a project is built for production, less files get combined
and compiled into a single css file, which gets placed right next
to the index.html file, like this:
awesome-project/
├── index.html
├── main.css
└── assets/
    ├── data/
    └── images/
        └── fathom.png

The new url for the background image doesn't need to go up (with '../'),
but rather starts in the same directory, starting with './':
  background-image: url(./assets/images/fathom.png)

It's a small difference, but that missing dot makes the
difference between the final web page showing the background
image or not.

We want our project building code to resolve this sort of
problem for us. Ideally, we should be able to write the
urls like they will be in production, where we don't have
to worry about how deep down in a subfolder they might be.

This code looks for urls coming from your less files,
and replaces them with a straight reference to the assets
folder. The intent here would be that no matter where
in the ./src/style/ folder your less file is, you can
enter the url starting with './assets'.

Without this code, that would break things in development.
for example, in a file 'sub.less' in a folder like this,
src/
├── index.html
├── style/
│   ├── main.less
│   └── subfolder/
│       └── sub.less
...


if you had
  background: url('./assets/images/fathom.png');
the dev server would look for the url
  /style/subfolder/assets/images/fathom.png

That doesn't exist, and the background image would not be
found. This code takes that url, and replaces it with
  /assets/images/fathom.png

and tada! it works. The point here is that you can enter a
url that will work in production. But, hmmmm, in the long
run there's no checking that the url will work in production.

I wonder if we can add something to the build step to look
for assets urls and make them relative path compatible…

ref: https://vitejs.dev/guide/api-plugin.html#configureserver
*/
const cssAssetsFixPlugin = {
  name: 'css-assets-fix',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      /*
      This regular expression checks for an incoming url
      that starts with '/style/', has '/assets/' in it,
      and may have other subfolders in between.
      */
      let pathRegex = /\/style\/([a-z]+\/)?assets\//;
      if (req.originalUrl.match(pathRegex)) {
        /*
        if we have a match, replace the "/style.../assets/"
        with just "/assets/"
        */
        req.url = req.originalUrl.replace(pathRegex, '/assets/');
      }
      next()
    })
  }
}



/*
documentation for the configuration can be found at
https://vitejs.dev/config/
*/
export default defineConfig({
  base: './',
  plugins: [
    eslint({fix: true, formatter: 'stylish'}),
    checker({typescript: true,}),
    {
      // Need the following HTTP headers for WASM + Web Workers to work
      name: "isolation",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      },
    },
    cssAssetsFixPlugin,
    handlebars({
      partialDirectory: path.resolve(__dirname, 'src/views'),
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  publicDir : '../public',
  server: {
    port:8000
  },
  build: {
    sourcemap:true,
    outDir: distDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        privacy: resolve(__dirname, "src/privacy/index.html"),
        terms: resolve(__dirname, "src/terms/index.html")
      }
    }
  }
});
