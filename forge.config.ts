const config = {
  packagerConfig: { asar: true },
  makers: [{ name: "@electron-forge/maker-zip", config: {} }],
  plugins: [
    {
      name: "@electron-forge/plugin-vite",
      config: {
        build: [
          { entry: "apps/studio/src/main.ts", config: "vite.config.mts" },
          { entry: "apps/studio/src/preload.ts", config: "vite.config.mts" },
        ],
        renderer: [{ name: "main_window", config: "vite.renderer.config.mts" }],
      },
    },
  ],
};

export default config;
