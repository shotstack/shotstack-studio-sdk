# Vue Example
[![Edit on CodeSandbox](https://img.shields.io/badge/Edit_on-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/devbox/studio-sdk-vue-9hcp2k)

This example demonstrates how to use the Shotstack Studio SDK with a Vue application.

## Key files

- `package.json`: Lists the dependencies and scripts for the Vue app.
- `src/App.vue`: Main component that initializes and controls the Shotstack Studio SDK.
- `src/plugins/shotstack.js`: Handles the loading of the Shotstack SDK script and global setup.
- `src/components/StudioEditor.vue`: Component that embeds the Shotstack Studio editor.
- `src/templates/template.json`: JSON template used for the Shotstack Studio SDK.

## Installation

Clone the repository and navigate to the Vue example directory.

```bash
git clone https://github.com/yourusername/shotstack-studio-sdk-demos.git
cd shotstack-studio-sdk-demos/demos/vue
```

Install the necessary dependencies:

```bash
yarn install
```

## Usage

Start the development server:

```bash
yarn serve
```

Open `http://localhost:8080` in your browser to see the app in action.

## Additional Information

Refer to the Shotstack Studio SDK documentation for more details:

- [Studio SDK Guide](https://shotstack.io/docs/guide/studio-sdk/)
- [Embedding the Studio](https://shotstack.io/docs/guide/studio-sdk/embedding-the-studio/)
- [Configuring the Studio](https://shotstack.io/docs/guide/studio-sdk/configuring-the-studio/)
- [Interacting with the Studio](https://shotstack.io/docs/guide/studio-sdk/interacting-with-the-studio/)

For more information about Shotstack, visit [Shotstack.io](https://shotstack.io).