# 🛠️ grail - Effortless Research and QA for AIs

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/grail_logo_dark.png" />
    <img alt="Grail" src="branding/grail_logo.png" width="360" />
  </picture>
</p>

## 🚀 Getting Started

Grail is a research and QA toolkit designed for terminal AIs. It offers a headless browser and extraction abilities, allowing you to manage searches, bundle documents, and maintain long-lived sessions easily.

## 📥 Download Now

[![Download Grail](https://img.shields.io/badge/Download%20Grail-v1.0-blue)](https://github.com/kflorez93/grail/releases)

Visit this page to download: [Grail Releases](https://github.com/kflorez93/grail/releases)

## 🔍 Features

- **Headless Rendering**: Renders web pages without a browser visible to the user.
- **Readable Extraction**: Extracts key information from web pages for easier reading.
- **Search & Pick Workflow**: Quickly search through official documents and create bundles with relevant artifacts.
- **Rate Limiting**: Control the speed of your searches to avoid interruptions.
- **Long-Lived Sessions**: Keep your workspace ready for development and testing.

## 🛠️ Requirements

To use Grail, ensure you have the following:

- **Node.js 20+**: Tested on Linux x64 and macOS, including Apple Silicon/ARM64.
- **Optional**: Playwright for enhanced browser rendering and screenshots.

## 📝 Installation

To install Grail locally, follow these steps:

1. Open your terminal.
2. Run the installation script:

   ```bash
   ./scripts/install-local.sh
   ```

3. Update your PATH to access Grail easily:

   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

## ⚡ Quick Start

After downloading and installing Grail, you can quickly set it up in your project:

1. Initialize onboarding files by running:

   ```bash
   grail init --pretty
   ```

2. This command prepares everything you need and teaches your agent about Grail.

You can customize the topics as per your needs. For instance, here’s a sample command:

```bash
a cat "
- Topics: "ai,cli,docs,grail,headless,nodejs,oss,playwright,readability,research"
```

## 📥 Download & Install

For easy access, download Grail by visiting the links below:

- Direct download: [Grail Releases](https://github.com/kflorez93/grail/releases)
- Follow the installation steps above to set it up on your machine.

Feel free to follow up with any questions about using Grail or troubleshooting tips. Happy researching and testing!