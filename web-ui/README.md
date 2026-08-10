# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Deployment to Cloudflare Pages

1. **Build** the production bundle (outputs to `build/`):

   ```sh
   npm run build
   ```

2. **Deploy** the `build/` directory to Cloudflare Pages — via the dashboard (direct upload) or the Wrangler CLI:

   ```sh
   npx wrangler pages deploy build --project-name <your-project>
   ```

3. **After every deploy, purge the Cloudflare cache**: `Dashboard → your domain → Caching → Configuration → Purge Everything`. The build output intentionally contains `_headers`, `_redirects`, `manifest.json`, `service-worker.js` and `404.html` — these are picked up automatically by Cloudflare Pages.

### Why a `404.html` (important)

Cloudflare Pages serves `index.html` with HTTP 200 for **any missing path** unless the project contains a top-level `404.html`. Because Create React App uses content-hashed bundle names (`static/js/main.<hash>.js`), a browser or service worker holding a stale `index.html` will request an old hashed file that no longer exists and receive HTML with a `text/html` MIME type instead of the JavaScript — producing:

```
Refused to execute script ... because its MIME type ('text/html') is not executable
```

The `public/404.html` included here disables that SPA fallback so missing files return a real 404. Users who still see a blank screen after a deploy should **hard-refresh** (Ctrl/Cmd+Shift+R) or uninstall/reinstall the installed PWA.

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
