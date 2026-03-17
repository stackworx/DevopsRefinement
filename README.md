# DevopsRefinement

## Load the extension in Chrome

Follow these steps to build the extension locally and load it into your browser.

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd DevopsRefinement
```

### 2. Install dependencies

```bash
npm i
```

### 3. Build the extension

```bash
npm run build
```

This creates the production extension files in the `dist/` folder.

### 4. Open Chrome extensions

In Chrome, go to:

```text
chrome://extensions/
```

### 5. Enable Developer mode

Turn on **Developer mode** using the toggle in the top-right corner of the Extensions page.

### 6. Load the unpacked extension

- Click **Load unpacked**
- Select the `dist/` folder from this project

After that, the extension will appear in Chrome and be ready to use.

## Development workflow

When you make changes, rebuild the project before reloading the extension:

```bash
npm run build
```

Then return to `chrome://extensions/` and click the **Reload** button on the extension card.
